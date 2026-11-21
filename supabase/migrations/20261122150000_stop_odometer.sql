-- Odometer readings at stops, from the driver: when they arrive at the first
-- pickup and when they leave the last delivery. Together they give a load's
-- actual loaded miles (and, against the truck's previous load, its empty
-- miles), and the newest one keeps the truck's odometer current for
-- maintenance reminders. A reading is taken after its stop time, so a stop
-- with one is checked in and can't be removed by editing the stops.

alter table public.load_stops
  add column arrived_odometer integer
    check (arrived_odometer between 0 and 5000000),
  add column departed_odometer integer
    check (departed_odometer between 0 and 5000000);

-- Records (or, with null, clears) a stop's reading. Callers decide who may;
-- this keeps the readings in order along the load and moves the truck's
-- odometer up when the reading is higher than what it has.
create function public.apply_stop_odometer(
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
  end if;

  if event = 'arrived' then
    update public.load_stops set arrived_odometer = reading where id = s.id;
  else
    update public.load_stops set departed_odometer = reading where id = s.id;
  end if;

  -- Odometers only go up, so only a higher reading moves the truck's.
  if reading is not null then
    select truck_id into load_truck from public.loads where id = s.load_id;
    if load_truck is not null then
      update public.trucks
      set odometer = reading,
          odometer_on = (read_at at time zone 'UTC')::date
      where id = load_truck
        and organization_id = s.organization_id
        and (odometer is null or reading > odometer);
    end if;
  end if;
end;
$$;

revoke execute on function public.apply_stop_odometer(uuid, text, integer)
  from public, anon, authenticated;

-- The driver enters the odometer from their link, after tapping Arrived or
-- Departed. Same checks as checking in.
create function public.record_stop_odometer_by_token(
  link_token text,
  stop_position integer,
  event text,
  reading integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dp public.load_dispatches;
  load_status text;
  stop_id uuid;
begin
  if link_token !~ '^[0-9a-f]{64}$' then
    raise exception 'That link isn''t valid.' using errcode = 'P0002', hint = 'not_found';
  end if;
  select * into dp from public.load_dispatches where token = link_token;
  if dp.id is null then
    raise exception 'That link isn''t valid.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if dp.revoked_at is not null then
    raise exception 'This load was taken off your schedule.'
      using errcode = '42501', hint = 'revoked';
  end if;
  if public.is_organization_member(dp.organization_id) then
    raise exception 'Only the driver can enter readings from this link. Enter it on the load page instead.'
      using errcode = '42501', hint = 'not_driver';
  end if;
  if reading is null then
    raise exception 'Enter the odometer in miles.' using errcode = '22023', hint = 'range';
  end if;

  select status into load_status from public.loads where id = dp.load_id;
  if load_status not in ('dispatched', 'loaded', 'delivered') then
    raise exception 'This load isn''t on the road, so check-in is closed.'
      using errcode = '22023', hint = 'not_dispatched';
  end if;

  select id into stop_id from public.load_stops
  where load_id = dp.load_id and position = stop_position;
  if stop_id is null then
    raise exception 'That stop isn''t on the load anymore. Ask dispatch to send it again.'
      using errcode = 'P0002', hint = 'stop_not_found';
  end if;

  perform public.apply_stop_odometer(stop_id, event, reading);
end;
$$;

revoke execute on function public.record_stop_odometer_by_token(text, integer, text, integer) from public;
grant execute on function public.record_stop_odometer_by_token(text, integer, text, integer) to anon, authenticated;

-- Someone in the office enters, fixes or clears (null) a reading the driver
-- skipped or got wrong.
create function public.set_stop_odometer(
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
  org uuid;
begin
  select organization_id into org from public.load_stops where id = target_stop;
  if org is null or not public.is_organization_member(org) then
    raise exception 'That stop doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform public.apply_stop_odometer(target_stop, event, reading);
end;
$$;

revoke execute on function public.set_stop_odometer(uuid, text, integer) from public, anon;
grant execute on function public.set_stop_odometer(uuid, text, integer) to authenticated;

-- The driver's link gets the readings so far, and the truck's last known
-- odometer and the load's estimated miles to suggest the next reading.
create or replace function public.dispatch_stops(link_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  dp public.load_dispatches;
  l public.loads;
  truck_odometer integer;
begin
  if link_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into dp from public.load_dispatches where token = link_token;
  if dp.id is null or dp.revoked_at is not null then
    return null;
  end if;
  select * into l from public.loads where id = dp.load_id;
  select odometer into truck_odometer from public.trucks where id = l.truck_id;
  return jsonb_build_object(
    'status', l.status,
    'miles', l.miles,
    'truck_odometer', truck_odometer,
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', s.position,
        'kind', s.kind,
        'location', s.location,
        'arrived_at', s.arrived_at,
        'departed_at', s.departed_at,
        'arrived_odometer', s.arrived_odometer,
        'departed_odometer', s.departed_odometer
      ) order by s.position)
      from public.load_stops s where s.load_id = dp.load_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.dispatch_stops(text) from public;
grant execute on function public.dispatch_stops(text) to anon, authenticated;
