-- Detention counted from the driver's arrival, even hours before the
-- appointment: a driver in at 11 PM for an 8 AM pickup had detention
-- "starting" at 1 AM. Free time starts at the appointment when the driver
-- is early.
--
-- An appointment is a time as written at the stop, with no zone, so it
-- couldn't be compared with a check-in. Each stop now has the time zone of
-- its address (the web app looks it up when the load is saved) and, from
-- it, the moment its appointment starts. A stop with no zone yet counts
-- from arrival, as before. Appointments are still shown as written.

alter table public.load_stops
  add column time_zone text,
  add column appointment_at timestamptz;

comment on column public.load_stops.time_zone is
  'IANA time zone of the stop''s address, e.g. America/New_York. Null until looked up.';
comment on column public.load_stops.appointment_at is
  'The moment appointment_start is, in the stop''s time zone. Kept by a trigger; for detention, never for display.';

create function public.load_stops_appointment_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A new address may be in another zone: look it up again.
  if tg_op = 'UPDATE'
     and new.location is distinct from old.location
     and new.time_zone is not distinct from old.time_zone then
    new.time_zone := null;
  end if;
  new.appointment_at := case
    when new.time_zone is null or new.appointment_start is null
      or new.appointment_type = 'tbd' then null
    else new.appointment_start at time zone new.time_zone
  end;
  return new;
end;
$$;

create trigger load_stops_appointment_at
  before insert or update of location, time_zone, appointment_start, appointment_type
  on public.load_stops
  for each row execute function public.load_stops_appointment_at();

-- Saves the zone the web app found for a stop's address.
create function public.set_stop_time_zone(target_stop uuid, zone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
begin
  select organization_id into org from public.load_stops where id = target_stop;
  if org is null or not public.is_organization_member(org) then
    raise exception 'That stop doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = zone) then
    raise exception 'That isn''t a time zone.' using errcode = '22023', hint = 'bad_zone';
  end if;
  update public.load_stops set time_zone = zone where id = target_stop;
end;
$$;

revoke execute on function public.set_stop_time_zone(uuid, text) from public, anon;
grant execute on function public.set_stop_time_zone(uuid, text) to authenticated;

-- ------------------------------------------------------------ Notices ---

create or replace function public.queue_detention_notices()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.broker_updates (organization_id, load_id, stop_id, event)
  select s.organization_id, s.load_id, s.id, notice.event
  from public.load_stops s
  join public.loads l on l.id = s.load_id
  join public.organizations o on o.id = l.organization_id
  left join public.brokers b on b.id = l.broker_id
  cross join lateral (
    select greatest(s.arrived_at, s.appointment_at)
           + make_interval(secs => l.detention_free_hours::double precision * 3600) as free_until
  ) f
  cross join lateral (
    select case
      when now() >= f.free_until then 'detention_started'
      when now() >= f.free_until - interval '30 minutes' then 'detention_soon'
    end as event
  ) notice
  where s.arrived_at is not null
    and s.departed_at is null
    and s.arrived_at > now() - interval '24 hours'
    and l.status in ('dispatched', 'loaded')
    and l.detention_free_hours is not null
    and o.detention_notices
    and coalesce(b.status_updates, true)
    and (l.broker_id is not null or l.rate_con_from is not null)
    and notice.event is not null
  on conflict do nothing;
end;
$$;


-- ------------------------------------------------------------- Charge ---

create or replace function public.load_stops_detention_charge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.loads;
  auto boolean;
  zone text;
  started timestamptz;
  on_site numeric;
  billable numeric;
  amount numeric;
begin
  if old.departed_at is not null or new.departed_at is null or new.arrived_at is null then
    return null;
  end if;
  select * into l from public.loads where id = new.load_id;
  if l.status not in ('dispatched', 'loaded', 'delivered')
     or l.detention_free_hours is null or l.detention_rate is null then
    return null;
  end if;
  select o.detention_auto_charge, o.time_zone into auto, zone
  from public.organizations o where o.id = l.organization_id;
  if not coalesce(auto, false) then
    return null;
  end if;

  -- Early for the appointment: free time starts when the appointment does.
  started := greatest(new.arrived_at, new.appointment_at);
  zone := coalesce(new.time_zone, zone, 'America/Chicago');
  on_site := extract(epoch from (new.departed_at - started)) / 3600;
  billable := ceil((on_site - l.detention_free_hours) * 4) / 4;
  if billable <= 0 then
    return null;
  end if;
  amount := round(billable * l.detention_rate, 2);
  if exists (
    select 1 from public.load_charges c
    where c.load_id = l.id and c.kind = 'detention'
      and c.description like 'Stop ' || new.position || ':%'
  ) then
    return null;
  end if;

  insert into public.load_charges
    (organization_id, load_id, kind, description, amount, source, created_by)
  values (
    l.organization_id, l.id, 'detention',
    left(
      'Stop ' || new.position || ': ' || trim(to_char(billable, 'FM990.99')) || ' h past free time (in '
        || to_char(new.arrived_at at time zone zone, 'Mon FMDD FMHH12:MI AM')
        || case when started > new.arrived_at
             then ', appt ' || to_char(started at time zone zone, 'FMHH12:MI AM') else '' end
        || ', out '
        || to_char(new.departed_at at time zone zone, 'FMHH12:MI AM')
        || ')',
      120
    ),
    amount, 'accessorial', null
  );
  return null;
exception when others then
  raise warning 'detention charge not added: %', sqlerrm;
  return null;
end;
$$;


-- ---------------------------------------------------------- Driver app ---

-- The driver's load says when each appointment starts, for "Detention
-- starts" on the phone.
create or replace function public.my_load(target_load uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.loads;
  my_driver uuid := public.my_load_driver(target_load);
  sees_rate boolean;
begin
  if my_driver is null then
    raise exception 'That load isn''t on your schedule.' using errcode = 'P0002', hint = 'not_found';
  end if;
  select * into l from public.loads where id = target_load;
  sees_rate := coalesce(public.driver_sees_rate(l.id), false);

  return (public.load_dispatch_packet(l.id, sees_rate) - 'stops') || jsonb_build_object(
    'id', l.id,
    'status', l.status,
    'delivered_on', l.delivered_on,
    'can_edit', l.status in ('dispatched', 'loaded', 'delivered'),
    'truck_odometer', public.truck_odometer_floor(l.id, now()),
    'detention_free_hours', l.detention_free_hours,
    'truck_details', (
      select jsonb_build_object(
        'unit_number', t.unit_number,
        'year', t.year,
        'make', t.make,
        'model', t.model,
        'vin', t.vin,
        'plate_number', t.plate_number,
        'plate_state', t.plate_state,
        'odometer', t.odometer,
        'odometer_on', t.odometer_on,
        'annual_inspection_on', t.annual_inspection_on,
        'registration_expires_on', t.registration_expires_on
      )
      from public.trucks t
      where t.id = l.truck_id and t.organization_id = l.organization_id
    ),
    'organization', (
      select jsonb_build_object('id', o.id, 'name', o.name, 'phone', o.phone, 'time_zone', o.time_zone)
      from public.organizations o where o.id = l.organization_id
    ),
    'driver_pay', (
      select case when coalesce(l.driver_pay_type, d.pay_type) is not null then jsonb_build_object(
        'type', coalesce(l.driver_pay_type, d.pay_type),
        'rate', case when l.driver_pay_type is not null then l.driver_pay_rate else d.pay_rate end
      ) end
      from public.drivers d where d.id = my_driver
    ),
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'position', s.position,
        'kind', s.kind,
        'facility', s.facility,
        'location', s.location,
        'appointment_type', s.appointment_type,
        'appointment_start', s.appointment_start,
        'appointment_end', s.appointment_end,
        'appointment_at', s.appointment_at,
        'stop_number', s.stop_number,
        'reference_numbers', s.reference_numbers,
        'contact_phone', s.contact_phone,
        'notes', s.notes,
        'arrived_at', s.arrived_at,
        'arrived_source', s.arrived_source,
        'arrived_odometer', s.arrived_odometer,
        'departed_at', s.departed_at,
        'departed_source', s.departed_source,
        'departed_odometer', s.departed_odometer
      ) order by s.position)
      from public.load_stops s where s.load_id = l.id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', doc.id,
        'kind', doc.kind,
        'path', doc.path,
        'file_name', doc.file_name,
        'content_type', doc.content_type,
        'size_bytes', doc.size_bytes,
        'created_at', doc.created_at,
        'mine', doc.uploaded_by = (select auth.uid())
      ) order by doc.created_at)
      from public.load_documents doc
      where doc.load_id = l.id
        and (doc.kind <> 'rate_con' or coalesce(public.driver_sees_rate_con(l.id), false))
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'kind', e.kind,
        'amount', e.amount,
        'paid_by', e.paid_by,
        'spent_on', e.spent_on,
        'note', e.note,
        'receipt_path', e.receipt_path,
        'receipt_type', e.receipt_type,
        'created_at', e.created_at,
        'mine', coalesce(e.created_by = (select auth.uid()), false)
      ) order by e.spent_on, e.created_at)
      from public.load_expenses e
      where e.load_id = l.id
        and (e.paid_by = 'driver' or e.created_by = (select auth.uid()))
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.my_load(uuid) from public, anon;
grant execute on function public.my_load(uuid) to authenticated;
