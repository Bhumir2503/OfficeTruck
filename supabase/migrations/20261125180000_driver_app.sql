-- What the driver app can see and do. A driver signs in with an SMS code,
-- claim_driver_logins() ties them to their drivers row, and from then on
-- they reach their own loads only through the functions below. Nothing is
-- opened up on the tables themselves, so a driver can't select a load's
-- rate or charges directly. The functions hand back what the driver needs,
-- the same way the old dispatch link did:
--
--   * my_loads / my_load       their loads, the stops, paperwork and their
--                              own expenses. The rate comes back only when
--                              they're owed it: the company shares rates,
--                              or the driver is paid a percent of the load
--                              (49 CFR 376.12(g)).
--   * record_my_stop_event     Arrived / Departed, with an optional odometer.
--     set_my_stop_odometer     The phone sends the time it was tapped, so a
--                              tap queued without signal keeps its real
--                              time. A resent tap is accepted again.
--   * add_my_load_document     BOL, POD, lumper receipt, other. Upload the
--                              file to load-documents/<org>/<load>/… first.
--   * add_my_expense           Money out of the driver's pocket.
--   * my_settlements /         Pay statements. Load rates are taken out of
--     my_settlement            the lines unless the driver is owed them.
--
-- A driver sees a load once it's been sent to them (any status but booked
-- or canceled) for as long as they're its driver. They can change things
-- only while it's on the road: dispatched, loaded or delivered.

-- ------------------------------------------------------------ Helpers -----

-- The caller's driver id on this load: they're signed in as its driver,
-- haven't left, and the load has been sent. Null otherwise.
create function public.my_load_driver(target_load uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.loads l
  join public.drivers d
    on d.organization_id = l.organization_id and d.id = l.driver_id
  where l.id = target_load
    and d.user_id = (select auth.uid())
    and (d.end_date is null or d.end_date >= current_date)
    and l.status not in ('booked', 'cancelled');
$$;

revoke execute on function public.my_load_driver(uuid) from public, anon;
grant execute on function public.my_load_driver(uuid) to authenticated;

-- Whether the load's driver may see what it pays: the company shares
-- rates with drivers, or the driver is paid a percent of it. Same rule as
-- dispatch_load.
create function public.driver_sees_rate(target_load uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(o.share_rate_with_drivers, false)
      or coalesce(l.driver_pay_type, d.pay_type) = 'percent'
  from public.loads l
  join public.organizations o on o.id = l.organization_id
  left join public.drivers d on d.id = l.driver_id
  where l.id = target_load;
$$;

revoke execute on function public.driver_sees_rate(uuid) from public, anon, authenticated;

-- The load id in a load-documents path, <org>/<load>/<file>. Null if the
-- second folder isn't a uuid.
create function public.load_document_load(path text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when (storage.foldername(path))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(path))[2])::uuid
  end;
$$;

revoke execute on function public.load_document_load(text) from public, anon;
grant execute on function public.load_document_load(text) to authenticated;

-- The caller can add files to this load's folder: they're its driver and
-- it's on the road.
create function public.driver_can_write_load_folder(path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.loads l
    where l.id = public.load_document_load(path)
      and l.organization_id = public.driver_document_organization(path)
      and l.status in ('dispatched', 'loaded', 'delivered')
      and public.my_load_driver(l.id) is not null
  );
$$;

revoke execute on function public.driver_can_write_load_folder(text) from public, anon;
grant execute on function public.driver_can_write_load_folder(text) to authenticated;

-- The caller can open this file: it's paperwork or a receipt on one of
-- their loads. The rate con only when they may see the rate.
create function public.driver_can_read_load_file(path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.my_load_driver(public.load_document_load(path)) is not null
    and (
      exists (
        select 1 from public.load_documents doc
        where doc.path = driver_can_read_load_file.path
          and (doc.kind <> 'rate_con' or public.driver_sees_rate(doc.load_id))
      )
      or exists (
        select 1 from public.load_expenses e
        where e.receipt_path = driver_can_read_load_file.path
          and (e.paid_by = 'driver' or e.created_by = (select auth.uid()))
      )
    );
$$;

revoke execute on function public.driver_can_read_load_file(text) from public, anon;
grant execute on function public.driver_can_read_load_file(text) to authenticated;

-- Raises unless the caller is the driver of a load that's on the road.
-- Returns the load.
create function public.require_my_load_on_road(target_load uuid)
returns public.loads
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.loads;
begin
  if public.my_load_driver(target_load) is null then
    raise exception 'That load isn''t on your schedule.' using errcode = 'P0002', hint = 'not_found';
  end if;
  select * into l from public.loads where id = target_load;
  if l.status not in ('dispatched', 'loaded', 'delivered') then
    raise exception 'This load isn''t on the road anymore, so it can''t be changed from the app.'
      using errcode = '22023', hint = 'not_on_road';
  end if;
  return l;
end;
$$;

revoke execute on function public.require_my_load_on_road(uuid) from public, anon, authenticated;

-- --------------------------------------------------------- Storage -----

create policy "Drivers can upload to their loads"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'load-documents'
    and (select public.driver_can_write_load_folder(name))
  );

-- Their own uploads (also before they're added to the load), and the
-- load's paperwork they're allowed to see.
create policy "Drivers can see their loads' files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'load-documents'
    and (
      (owner_id = (select auth.uid())::text and (select public.driver_can_write_load_folder(name)))
      or (select public.driver_can_read_load_file(name))
    )
  );

-- ------------------------------------------------------------ Reading -----

-- The caller's loads, newest first, with what's on the road on top. Loads
-- from the last 120 days, plus any still on the road.
create function public.my_loads()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(row_data order by on_road desc, pickup_start desc), '[]'::jsonb)
  from (
    select
      l.status in ('dispatched', 'loaded', 'delivered') as on_road,
      l.pickup_start,
      jsonb_build_object(
        'id', l.id,
        'organization_id', l.organization_id,
        'organization_name', o.name,
        'reference', l.reference,
        'status', l.status,
        'pickup_location', l.pickup_location,
        'pickup_start', l.pickup_start,
        'delivery_location', l.delivery_location,
        'delivery_start', l.delivery_start,
        'delivered_on', l.delivered_on,
        'truck', (select t.unit_number from public.trucks t where t.id = l.truck_id),
        'trailer_number', l.trailer_number,
        'stop_count', (select count(*) from public.load_stops s where s.load_id = l.id),
        'stops_departed', (
          select count(*) from public.load_stops s
          where s.load_id = l.id and s.departed_at is not null
        )
      ) as row_data
    from public.loads l
    join public.drivers d
      on d.organization_id = l.organization_id and d.id = l.driver_id
    join public.organizations o on o.id = l.organization_id
    where d.user_id = (select auth.uid())
      and (d.end_date is null or d.end_date >= current_date)
      and l.status not in ('booked', 'cancelled')
      and (
        l.status in ('dispatched', 'loaded', 'delivered')
        or l.pickup_start >= (now() - interval '120 days')::timestamp
      )
    order by on_road desc, l.pickup_start desc
    limit 200
  ) mine;
$$;

revoke execute on function public.my_loads() from public, anon;
grant execute on function public.my_loads() to authenticated;

-- One of the caller's loads: what dispatch sends (the rate only when
-- they're owed it), the stops with their check-ins, the paperwork they
-- may see, their own expenses, their pay on the load, and who to call.
create function public.my_load(target_load uuid)
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
      where doc.load_id = l.id and (doc.kind <> 'rate_con' or sees_rate)
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'kind', e.kind,
        'amount', e.amount,
        'spent_on', e.spent_on,
        'note', e.note,
        'receipt_path', e.receipt_path,
        'receipt_type', e.receipt_type,
        'created_at', e.created_at
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

-- ----------------------------------------------------------- Check-ins -----

-- Arrived or Departed at a stop, as the driver. tapped_at is when they
-- tapped it on the phone (now if left out), so a tap that waited for
-- signal keeps its time; it can't be more than a day old. Sending the same
-- tap again (a retry after a dropped connection) is fine. With an
-- odometer, the reading is saved with it.
create function public.record_my_stop_event(
  target_stop uuid,
  event text,
  tapped_at timestamptz default null,
  odometer integer default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.load_stops;
  stamped timestamptz := coalesce(tapped_at, now());
begin
  select * into s from public.load_stops where id = target_stop;
  if s.id is null then
    raise exception 'That stop doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform public.require_my_load_on_road(s.load_id);

  if stamped < now() - interval '24 hours' then
    raise exception 'That check-in is more than a day old. Call dispatch to enter it.'
      using errcode = '22023', hint = 'too_old';
  end if;

  -- The same tap sent again.
  if (event = 'arrived' and s.arrived_source = 'driver' and s.arrived_at = stamped)
     or (event = 'departed' and s.departed_source = 'driver' and s.departed_at = stamped) then
    null;
  else
    stamped := public.stamp_stop_time(target_stop, event, stamped, 'driver', (select auth.uid()), null);
  end if;

  if odometer is not null then
    perform public.apply_stop_odometer(target_stop, event, odometer);
  end if;

  return stamped;
end;
$$;

revoke execute on function public.record_my_stop_event(uuid, text, timestamptz, integer) from public, anon;
grant execute on function public.record_my_stop_event(uuid, text, timestamptz, integer) to authenticated;

-- Enters or fixes the odometer at a stop the driver already checked in at.
create function public.set_my_stop_odometer(target_stop uuid, event text, reading integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.load_stops;
begin
  select * into s from public.load_stops where id = target_stop;
  if s.id is null then
    raise exception 'That stop doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform public.require_my_load_on_road(s.load_id);
  if reading is null then
    raise exception 'Enter the odometer in miles.' using errcode = '22023', hint = 'range';
  end if;
  perform public.apply_stop_odometer(target_stop, event, reading);
end;
$$;

revoke execute on function public.set_my_stop_odometer(uuid, text, integer) from public, anon;
grant execute on function public.set_my_stop_odometer(uuid, text, integer) to authenticated;

-- ------------------------------------------------------- Paperwork -----

-- Adds a file the driver uploaded to load-documents/<org>/<load>/… as one
-- of the load's documents. A BOL or POD moves the load along, like one
-- added in the office. Sending the same path again returns the same row.
create function public.add_my_load_document(
  target_load uuid,
  kind text,
  path text,
  file_name text,
  content_type text,
  size_bytes integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.loads := public.require_my_load_on_road(target_load);
  existing public.load_documents;
  new_id uuid;
begin
  if kind not in ('bol', 'pod', 'lumper_receipt', 'other') then
    raise exception 'Drivers can add a BOL, POD, lumper receipt or other paperwork.'
      using errcode = '22023', hint = 'bad_kind';
  end if;
  if path not like l.organization_id::text || '/' || l.id::text || '/%' then
    raise exception 'Upload the file to this load''s folder first.'
      using errcode = '22023', hint = 'bad_path';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'load-documents' and o.name = add_my_load_document.path
  ) then
    raise exception 'The file isn''t uploaded yet.' using errcode = 'P0002', hint = 'no_file';
  end if;

  select * into existing from public.load_documents d where d.path = add_my_load_document.path;
  if existing.id is not null then
    if existing.load_id <> l.id or existing.uploaded_by is distinct from (select auth.uid()) then
      raise exception 'That file is already on another document.' using errcode = '23505', hint = 'duplicate';
    end if;
    return existing.id;
  end if;

  insert into public.load_documents
    (organization_id, load_id, kind, path, file_name, content_type, size_bytes, uploaded_by)
  values
    (l.organization_id, l.id, kind, path, file_name, content_type, size_bytes, (select auth.uid()))
  returning id into new_id;

  return new_id;
end;
$$;

revoke execute on function public.add_my_load_document(uuid, text, text, text, text, integer) from public, anon;
grant execute on function public.add_my_load_document(uuid, text, text, text, text, integer) to authenticated;

-- An expense the driver paid out of pocket, so it's owed back to them. A
-- receipt, if any, is uploaded to the load's folder first. client_id is
-- the phone's id for it, so a retry doesn't add it twice.
create function public.add_my_expense(
  target_load uuid,
  kind text,
  amount numeric,
  spent_on date,
  note text default null,
  receipt_path text default null,
  receipt_name text default null,
  receipt_type text default null,
  client_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.loads := public.require_my_load_on_road(target_load);
  new_id uuid := coalesce(client_id, gen_random_uuid());
begin
  if exists (select 1 from public.load_expenses e where e.id = new_id) then
    if exists (
      select 1 from public.load_expenses e
      where e.id = new_id and e.load_id = l.id and e.created_by = (select auth.uid())
    ) then
      return new_id;
    end if;
    raise exception 'That expense id is taken.' using errcode = '23505', hint = 'duplicate';
  end if;

  if spent_on > current_date + 1 then
    raise exception 'That date is in the future.' using errcode = '22023', hint = 'future';
  end if;
  if receipt_path is not null and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'load-documents' and o.name = add_my_expense.receipt_path
  ) then
    raise exception 'The receipt isn''t uploaded yet.' using errcode = 'P0002', hint = 'no_file';
  end if;

  insert into public.load_expenses
    (id, organization_id, load_id, kind, amount, spent_on, paid_by, note,
     receipt_path, receipt_name, receipt_type, created_by)
  values
    (new_id, l.organization_id, l.id, kind, amount, spent_on, 'driver', nullif(trim(note), ''),
     receipt_path, receipt_name, receipt_type, (select auth.uid()));

  return new_id;
end;
$$;

revoke execute on function public.add_my_expense(uuid, text, numeric, date, text, text, text, text, uuid) from public, anon;
grant execute on function public.add_my_expense(uuid, text, numeric, date, text, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------- Pay -----

-- The caller's pay statements, newest first. Totals are set once a
-- statement is paid; an open one is still being worked out in the office.
-- Kept after a driver leaves, so they can still see their last pay.
create function public.my_settlements()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', st.id,
    'organization_name', o.name,
    'period_start', st.week_start,
    'period_end', st.period_end,
    'status', st.status,
    'paid_on', st.paid_on,
    'gross_pay', st.gross_pay,
    'reimbursements', st.reimbursements,
    'adjustments', st.adjustments,
    'net_pay', st.net_pay,
    'load_count', coalesce(cardinality(st.load_ids), 0)
  ) order by st.week_start desc, st.period_end desc), '[]'::jsonb)
  from public.driver_settlements st
  join public.drivers d on d.organization_id = st.organization_id and d.id = st.driver_id
  join public.organizations o on o.id = st.organization_id
  where d.user_id = (select auth.uid());
$$;

revoke execute on function public.my_settlements() from public, anon;
grant execute on function public.my_settlements() to authenticated;

-- One pay statement with its adjustments and, once paid, its lines. Each
-- load line's rate is taken out unless the driver may see that load's rate.
create function public.my_settlement(target_settlement uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  st public.driver_settlements;
begin
  select st2.* into st
  from public.driver_settlements st2
  join public.drivers d on d.organization_id = st2.organization_id and d.id = st2.driver_id
  where st2.id = target_settlement and d.user_id = (select auth.uid());
  if st.id is null then
    raise exception 'That pay statement doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;

  return jsonb_build_object(
    'id', st.id,
    'period_start', st.week_start,
    'period_end', st.period_end,
    'status', st.status,
    'paid_on', st.paid_on,
    'notes', st.notes,
    'gross_pay', st.gross_pay,
    'reimbursements', st.reimbursements,
    'adjustments', st.adjustments,
    'net_pay', st.net_pay,
    'adjustment_lines', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'description', a.description, 'amount', a.amount)
        order by a.created_at)
      from public.driver_settlement_adjustments a where a.settlement_id = st.id
    ), '[]'::jsonb),
    'loads', coalesce((
      select jsonb_agg(
        case when public.driver_sees_rate((line ->> 'id')::uuid) then line else line - 'rate' end
        order by ord)
      from jsonb_array_elements(st.paid_lines -> 'loads') with ordinality as x(line, ord)
    ), '[]'::jsonb),
    'expenses', coalesce(st.paid_lines -> 'expenses', '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.my_settlement(uuid) from public, anon;
grant execute on function public.my_settlement(uuid) to authenticated;
