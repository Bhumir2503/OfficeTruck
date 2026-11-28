-- set_stop_time_zone checked the zone against pg_timezone_names, a view
-- that reads every zone file on each call: about a second of database CPU
-- per stop, on every new load. A few dispatchers saving loads at once was
-- enough to push other requests past the statement timeout. Asking
-- Postgres to use the zone is the same check and costs nothing.
create or replace function public.set_stop_time_zone(target_stop uuid, zone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  -- An IANA name such as America/Chicago: not an abbreviation or an offset.
  valid boolean := coalesce(zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$', false);
begin
  select organization_id into org from public.load_stops where id = target_stop;
  if org is null or not public.is_organization_member(org) then
    raise exception 'That stop doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if valid then
    begin
      perform now() at time zone zone;
    exception when invalid_parameter_value then
      valid := false;
    end;
  end if;
  if not valid then
    raise exception 'That isn''t a time zone.' using errcode = '22023', hint = 'bad_zone';
  end if;
  update public.load_stops set time_zone = zone where id = target_stop;
end;
$$;
