-- A truck's odometer never goes backwards. A reading at a stop can't be
-- lower than the truck's last reading before it: from the truck's other
-- loads, or one the office entered on the truck itself. Within a load the
-- readings were already kept in order (apply_stop_odometer); this checks
-- them against the truck's history too, for the office, the driver's link
-- and the driver app alike. The app also gets the number, so it can say
-- what the last reading was before the driver types a new one.

-- The truck's highest reading before a time, leaving out the load's own
-- readings (they're checked in order along the load already). The office's
-- own reading on the truck counts when it was taken by that day and isn't
-- just a copy of a stop's reading. Null when the load has no truck or the
-- truck has no reading yet.
create function public.truck_odometer_floor(target_load uuid, before timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    (
      select max(r) from (
        select st.arrived_odometer as r
        from public.load_stops st
        join public.loads other on other.id = st.load_id
        where other.truck_id = t.id
          and other.organization_id = t.organization_id
          and other.id <> l.id
          and st.arrived_at < before
        union all
        select st.departed_odometer
        from public.load_stops st
        join public.loads other on other.id = st.load_id
        where other.truck_id = t.id
          and other.organization_id = t.organization_id
          and other.id <> l.id
          and st.departed_at < before
      ) readings
    ),
    (
      select t.odometer
      where t.odometer_on <= (before at time zone 'UTC')::date
        and not exists (
          select 1
          from public.load_stops st
          join public.loads any_load on any_load.id = st.load_id
          where any_load.truck_id = t.id
            and (st.arrived_odometer = t.odometer or st.departed_odometer = t.odometer)
        )
    )
  )
  from public.loads l
  join public.trucks t on t.id = l.truck_id and t.organization_id = l.organization_id
  where l.id = target_load;
$$;

revoke execute on function public.truck_odometer_floor(uuid, timestamptz)
  from public, anon, authenticated;

-- apply_stop_odometer: also not below the truck's last reading before this
-- one. Otherwise unchanged.
create or replace function public.apply_stop_odometer(
  target_stop uuid,
  event text,
  reading integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.load_stops;
  lower_bound integer;
  upper_bound integer;
  load_truck uuid;
  read_at timestamptz;
  previous integer;
  truck_floor integer;
begin
  select * into s from public.load_stops where id = target_stop for update;
  if s.id is null then
    raise exception 'That stop doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if event not in ('arrived', 'departed') then
    raise exception 'Unknown stop event.' using errcode = '22023', hint = 'bad_event';
  end if;
  if reading is not null and (reading < 0 or reading > 5000000) then
    raise exception 'Enter the odometer in miles.' using errcode = '22023', hint = 'range';
  end if;
  read_at := case event when 'arrived' then s.arrived_at else s.departed_at end;
  if read_at is null then
    raise exception 'Record the % first.', case event when 'arrived' then 'arrival' else 'departure' end
      using errcode = '22023', hint = 'no_time';
  end if;

  if reading is not null then
    -- Readings only go up along the load: not below an earlier one, not
    -- above a later one.
    select max(r) into lower_bound from (
      select arrived_odometer as r from public.load_stops
        where load_id = s.load_id and position < s.position
      union all
      select departed_odometer from public.load_stops
        where load_id = s.load_id and position < s.position
      union all
      select s.arrived_odometer where event = 'departed'
    ) earlier;
    select min(r) into upper_bound from (
      select arrived_odometer as r from public.load_stops
        where load_id = s.load_id and position > s.position
      union all
      select departed_odometer from public.load_stops
        where load_id = s.load_id and position > s.position
      union all
      select s.departed_odometer where event = 'arrived'
    ) later;
    if lower_bound is not null and reading < lower_bound then
      raise exception 'That''s lower than the % mi recorded earlier on this load.',
        to_char(lower_bound, 'FM9,999,999')
        using errcode = '22023', hint = 'lower';
    end if;
    if upper_bound is not null and reading > upper_bound then
      raise exception 'That''s higher than the % mi recorded later on this load.',
        to_char(upper_bound, 'FM9,999,999')
        using errcode = '22023', hint = 'higher';
    end if;
    truck_floor := public.truck_odometer_floor(s.load_id, read_at);
    if truck_floor is not null and reading < truck_floor then
      raise exception 'That''s lower than the truck''s last reading, % mi. Odometers only go up.',
        to_char(truck_floor, 'FM9,999,999')
        using errcode = '22023', hint = 'below_truck';
    end if;
  end if;

  previous := case event when 'arrived' then s.arrived_odometer else s.departed_odometer end;

  if event = 'arrived' then
    update public.load_stops set arrived_odometer = reading where id = s.id;
  else
    update public.load_stops set departed_odometer = reading where id = s.id;
  end if;

  -- Odometers only go up, so only a higher reading moves the truck's. The
  -- exception is fixing this very reading: when the truck's odometer came
  -- from it (a typo that was too high), the correction brings it back down.
  if reading is not null then
    select truck_id into load_truck from public.loads where id = s.load_id;
    if load_truck is not null then
      update public.trucks
      set odometer = reading,
          odometer_on = (read_at at time zone 'UTC')::date
      where id = load_truck
        and organization_id = s.organization_id
        and (
          odometer is null
          or reading > odometer
          or (previous is not null and reading < previous and odometer = previous)
        );
    end if;
  end if;
end;
$$;

revoke execute on function public.apply_stop_odometer(uuid, text, integer)
  from public, anon, authenticated;

-- my_load: the truck's last reading (truck_odometer), so the app can show it
-- and keep a new one from going lower. Otherwise unchanged.
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
