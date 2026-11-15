-- Stop details read off rate cons:
--   * appointment_type: a set appointment, a window (FCFS), or to be
--     scheduled. A stop to be scheduled has a date but no time yet; its
--     appointment_start is midnight that day and isn't a real time.
--   * facility: the shipper or receiver's name, apart from the address.
--   * contact_phone and reference_numbers (PO numbers) for each stop.
--   * notes already existed; the editor now fills them in.
-- loads.pickup_appointment_type and delivery_appointment_type follow the
-- first pickup and last delivery, like the other summary columns, so lists
-- can say "TBD" instead of showing midnight.

-- ------------------------------------------------------------ Stops -----

alter table public.load_stops
  add column appointment_type text not null default 'appointment'
    check (appointment_type in ('appointment', 'window', 'tbd')),
  add column facility text check (char_length(trim(facility)) between 1 and 120),
  add column contact_phone text check (char_length(contact_phone) <= 30),
  add column reference_numbers text check (char_length(reference_numbers) <= 200);

-- A stop with an end time was a window.
update public.load_stops set appointment_type = 'window'
where appointment_end is not null;

alter table public.load_stops
  -- Only a window has an end; a TBD stop's time is midnight on its date.
  add constraint load_stops_window_end check (
    (appointment_type = 'window') = (appointment_end is not null)
  ),
  add constraint load_stops_tbd_midnight check (
    appointment_type <> 'tbd' or appointment_start::time = '00:00'
  );

-- ------------------------------------------------- Load summaries -----

alter table public.loads
  add column pickup_appointment_type text not null default 'appointment'
    check (pickup_appointment_type in ('appointment', 'window', 'tbd')),
  add column delivery_appointment_type text not null default 'appointment'
    check (delivery_appointment_type in ('appointment', 'window', 'tbd'));

update public.loads set pickup_appointment_type = 'window'
where pickup_end is not null;
update public.loads set delivery_appointment_type = 'window'
where delivery_end is not null;

-- A delivery to be scheduled is midnight on its date, which can be before
-- a same-day pickup's time, so the summary only checks the dates.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.loads'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%delivery_start >= pickup_start%'
  loop
    execute format('alter table public.loads drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.loads
  add constraint loads_delivery_after_pickup
    check (delivery_start::date >= pickup_start::date);

create or replace function public.sync_load_stop_summary(target_load uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  first_pickup public.load_stops;
  last_delivery public.load_stops;
begin
  select * into first_pickup
  from public.load_stops
  where load_id = target_load and kind = 'pickup'
  order by position
  limit 1;

  select * into last_delivery
  from public.load_stops
  where load_id = target_load and kind = 'delivery'
  order by position desc
  limit 1;

  -- Mid-edit there may be no pickup or delivery yet; keep what's there.
  update public.loads
  set pickup_location = coalesce(first_pickup.location, pickup_location),
      pickup_start = coalesce(first_pickup.appointment_start, pickup_start),
      pickup_end = case when first_pickup.id is null then pickup_end
                        else first_pickup.appointment_end end,
      pickup_appointment_type = coalesce(first_pickup.appointment_type, pickup_appointment_type),
      delivery_location = coalesce(last_delivery.location, delivery_location),
      delivery_start = coalesce(last_delivery.appointment_start, delivery_start),
      delivery_end = case when last_delivery.id is null then delivery_end
                          else last_delivery.appointment_end end,
      delivery_appointment_type = coalesce(last_delivery.appointment_type, delivery_appointment_type)
  where id = target_load
    and (first_pickup.id is not null or last_delivery.id is not null);
end;
$$;

revoke execute on function public.sync_load_stop_summary(uuid) from public, anon, authenticated;

-- ----------------------------------------------------- Saving stops -----

-- Adds or replaces a load's stops. Each stop with an "id" keeps its arrived
-- and departed times; stops left out are removed, unless they already have
-- times on them. The first stop must be a pickup, the last a delivery, and
-- appointments must run in order (by date alone next to a stop to be
-- scheduled, since its time isn't known).
create or replace function public.save_load_stops(target_load uuid, stops jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  stop jsonb;
  pos integer := 0;
  previous timestamp;
  previous_tbd boolean := false;
  this_start timestamp;
  this_tbd boolean;
  this_type text;
  kept uuid[] := '{}';
begin
  select organization_id into org from public.loads where id = target_load;
  if org is null or not public.is_organization_member(org) then
    raise exception 'That load doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;

  if jsonb_typeof(stops) <> 'array' or jsonb_array_length(stops) < 2 then
    raise exception 'A load needs a pickup and a delivery.' using errcode = '22023', hint = 'too_few';
  end if;
  if jsonb_array_length(stops) > 50 then
    raise exception 'A load can have at most 50 stops.' using errcode = '22023', hint = 'too_many';
  end if;
  if stops->0->>'kind' <> 'pickup' or stops->-1->>'kind' <> 'delivery' then
    raise exception 'Start with a pickup and end with a delivery.' using errcode = '22023', hint = 'order';
  end if;

  for stop in select * from jsonb_array_elements(stops) loop
    this_start := (stop->>'appointment_start')::timestamp;
    this_tbd := coalesce(stop->>'appointment_type', 'appointment') = 'tbd';
    if previous is not null and (
      case when this_tbd or previous_tbd
        then this_start::date < previous::date
        else this_start < previous
      end
    ) then
      raise exception 'Stops must be in appointment order.' using errcode = '22023', hint = 'order';
    end if;
    previous := this_start;
    previous_tbd := this_tbd;
    if stop ? 'id' and stop->>'id' is not null then
      kept := kept || (stop->>'id')::uuid;
    end if;
  end loop;

  if exists (
    select 1 from public.load_stops
    where load_id = target_load
      and id <> all (kept)
      and arrived_at is not null
  ) then
    raise exception 'A stop the driver has already checked in at can''t be removed.'
      using errcode = '22023', hint = 'has_times';
  end if;

  delete from public.load_stops where load_id = target_load and id <> all (kept);

  for stop in select * from jsonb_array_elements(stops) loop
    pos := pos + 1;
    this_type := coalesce(stop->>'appointment_type', 'appointment');
    this_start := (stop->>'appointment_start')::timestamp;
    -- A stop to be scheduled keeps only its date.
    if this_type = 'tbd' then
      this_start := date_trunc('day', this_start);
    end if;
    if stop ? 'id' and stop->>'id' is not null then
      update public.load_stops
      set position = pos,
          kind = stop->>'kind',
          facility = nullif(trim(stop->>'facility'), ''),
          location = trim(stop->>'location'),
          appointment_type = this_type,
          appointment_start = this_start,
          appointment_end = case when this_type = 'window'
                                 then (stop->>'appointment_end')::timestamp end,
          stop_number = nullif(trim(stop->>'stop_number'), ''),
          reference_numbers = nullif(trim(stop->>'reference_numbers'), ''),
          contact_phone = nullif(trim(stop->>'contact_phone'), ''),
          notes = nullif(trim(stop->>'notes'), '')
      where id = (stop->>'id')::uuid and load_id = target_load;
      if not found then
        raise exception 'That stop isn''t on this load anymore.' using errcode = 'P0002', hint = 'stop_not_found';
      end if;
    else
      insert into public.load_stops
        (organization_id, load_id, position, kind, facility, location,
         appointment_type, appointment_start, appointment_end, stop_number,
         reference_numbers, contact_phone, notes)
      values (
        org, target_load, pos, stop->>'kind',
        nullif(trim(stop->>'facility'), ''),
        trim(stop->>'location'),
        this_type,
        this_start,
        case when this_type = 'window'
             then (stop->>'appointment_end')::timestamp end,
        nullif(trim(stop->>'stop_number'), ''),
        nullif(trim(stop->>'reference_numbers'), ''),
        nullif(trim(stop->>'contact_phone'), ''),
        nullif(trim(stop->>'notes'), '')
      );
    end if;
  end loop;
end;
$$;

revoke execute on function public.save_load_stops(uuid, jsonb) from public, anon;
grant execute on function public.save_load_stops(uuid, jsonb) to authenticated;

-- --------------------------------------------------- Driver's packet -----

-- What the driver is sent: the stops, appointments and numbers, the freight,
-- and the rate con only if the company shares rates with drivers.
create or replace function public.load_dispatch_packet(target_load uuid, include_rate boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'reference', l.reference,
    'broker_name', l.broker_name,
    'reference_numbers', l.reference_numbers,
    'equipment', l.equipment,
    'commodity', l.commodity,
    'weight_lbs', l.weight_lbs,
    'trailer_number', l.trailer_number,
    'notes', l.notes,
    'miles', l.miles,
    'truck', (select t.unit_number from public.trucks t where t.id = l.truck_id),
    'driver', (select d.full_name from public.drivers d where d.id = l.driver_id),
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', s.position,
        'kind', s.kind,
        'facility', s.facility,
        'location', s.location,
        'appointment_type', s.appointment_type,
        'appointment_start', s.appointment_start,
        'appointment_end', s.appointment_end,
        'stop_number', s.stop_number,
        'reference_numbers', s.reference_numbers,
        'contact_phone', s.contact_phone,
        'notes', s.notes
      ) order by s.position)
      from public.load_stops s where s.load_id = l.id
    ), '[]'::jsonb),
    'rate', case when include_rate then jsonb_build_object(
      'total', l.rate,
      'detention_free_hours', l.detention_free_hours,
      'detention_rate', l.detention_rate,
      'charges', coalesce((
        select jsonb_agg(jsonb_build_object(
          'kind', c.kind, 'description', c.description, 'amount', c.amount
        ) order by c.position)
        from public.load_charges c where c.load_id = l.id
      ), '[]'::jsonb)
    ) end
  )
  from public.loads l
  where l.id = target_load;
$$;

revoke execute on function public.load_dispatch_packet(uuid, boolean) from public, anon, authenticated;
