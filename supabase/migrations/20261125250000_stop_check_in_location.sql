-- Where the driver was when they tapped Check in or Check out in the driver
-- app, for detention later (proof the truck was at the dock, and when).
--
-- Kept on the stop beside the time and odometer, one fix per event: the
-- phone's latitude and longitude and how accurate it was, in meters. Only
-- the driver app sets them, and only when the phone allowed location; a
-- check-in without one still counts. They describe the driver's tap, so an
-- office edit of the time leaves them as they were.

alter table public.load_stops
  add column arrived_latitude double precision check (arrived_latitude between -90 and 90),
  add column arrived_longitude double precision check (arrived_longitude between -180 and 180),
  add column arrived_location_accuracy_m real check (arrived_location_accuracy_m >= 0),
  add column departed_latitude double precision check (departed_latitude between -90 and 90),
  add column departed_longitude double precision check (departed_longitude between -180 and 180),
  add column departed_location_accuracy_m real check (departed_location_accuracy_m >= 0),
  add constraint load_stops_arrived_location_pair
    check ((arrived_latitude is null) = (arrived_longitude is null)),
  add constraint load_stops_departed_location_pair
    check ((departed_latitude is null) = (departed_longitude is null));

-- record_my_stop_event() takes the location too. The old four-argument
-- version goes, so an app that doesn't send one calls this with the
-- defaults.
drop function public.record_my_stop_event(uuid, text, timestamptz, integer);

create function public.record_my_stop_event(
  target_stop uuid,
  event text,
  tapped_at timestamptz default null,
  odometer integer default null,
  latitude double precision default null,
  longitude double precision default null,
  location_accuracy double precision default null
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

  -- A fix that isn't a real place (or half of one) is left out rather than
  -- failing the check-in.
  if latitude between -90 and 90 and longitude between -180 and 180 then
    if event = 'arrived' then
      update public.load_stops
      set arrived_latitude = latitude,
          arrived_longitude = longitude,
          arrived_location_accuracy_m = greatest(location_accuracy, 0)
      where id = target_stop;
    else
      update public.load_stops
      set departed_latitude = latitude,
          departed_longitude = longitude,
          departed_location_accuracy_m = greatest(location_accuracy, 0)
      where id = target_stop;
    end if;
  end if;

  return stamped;
end;
$$;

revoke execute on function public.record_my_stop_event(uuid, text, timestamptz, integer, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.record_my_stop_event(uuid, text, timestamptz, integer, double precision, double precision, double precision)
  to authenticated;
