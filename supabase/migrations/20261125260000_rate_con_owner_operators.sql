-- The rate confirmation in the driver app: only for owner-operators.
--
-- Until now a driver saw the rate con whenever they could see the rate:
-- the company shares rates with drivers, or the driver is paid a percent of
-- the load. The company setting no longer opens the rate con. It shows only
-- when the load is owner-operated:
--
--   * the load's truck is an owner-operator truck (trucks.ownership), or
--   * the driver is paid a percent of the load, which entitles them to the
--     rated freight bill (49 CFR 376.12(g)).
--
-- The rate itself in the dispatch packet keeps its rule (driver_sees_rate).

create function public.driver_sees_rate_con(target_load uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(t.ownership = 'owner_operator', false)
      or coalesce(coalesce(l.driver_pay_type, d.pay_type) = 'percent', false)
  from public.loads l
  left join public.trucks t on t.id = l.truck_id
  left join public.drivers d on d.id = l.driver_id
  where l.id = target_load;
$$;

revoke execute on function public.driver_sees_rate_con(uuid) from public, anon, authenticated;

-- The caller can open this file: it's paperwork or a receipt on one of
-- their loads. The rate con only on an owner-operated load.
create or replace function public.driver_can_read_load_file(path text)
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
          and (doc.kind <> 'rate_con' or coalesce(public.driver_sees_rate_con(doc.load_id), false))
      )
      or exists (
        select 1 from public.load_expenses e
        where e.receipt_path = driver_can_read_load_file.path
          and (e.paid_by = 'driver' or e.created_by = (select auth.uid()))
      )
    );
$$;

-- my_load: the paperwork list leaves the rate con out unless the load is
-- owner-operated. Otherwise unchanged.
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
      where doc.load_id = l.id
        and (doc.kind <> 'rate_con' or coalesce(public.driver_sees_rate_con(l.id), false))
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
