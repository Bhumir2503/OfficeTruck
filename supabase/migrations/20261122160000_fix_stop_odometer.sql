-- Fixing an odometer reading at a stop. A reading can already be replaced
-- (the driver now has Edit on their link). If a too-high typo had moved the
-- truck's odometer up, correcting that same reading now brings the truck's
-- odometer back down with it.

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
