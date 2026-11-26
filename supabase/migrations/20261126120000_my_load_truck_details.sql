-- my_load: the truck on the load, for the Truck section of the load's info
-- sheet in the driver app: what a driver is asked for at a scale or an
-- inspection (unit, year, make and model, plate, VIN) and when the truck's
-- inspection and registration run out, with its last odometer reading.
-- Nothing about what the truck costs or who owns it. Otherwise unchanged.

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
