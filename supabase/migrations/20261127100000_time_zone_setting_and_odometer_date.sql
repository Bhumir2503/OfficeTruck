-- Two fixes from a test run of a real company.

-- 1. The company's time zone couldn't be changed: the column was there
-- (Central by default) with nothing to set it. Owners and admins can now,
-- under the same policy as the rest of the company's settings.
grant update (time_zone) on public.organizations to authenticated;

-- 2. A truck's odometer saved with no "read on" date was ignored: the
-- driver's check-in could enter a lower reading, and miles since the reading
-- couldn't be estimated. A reading with no date is one taken today, where
-- the company is.
create function public.trucks_odometer_read_on()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.odometer is not null and new.odometer_on is null then
    select (now() at time zone o.time_zone)::date into new.odometer_on
    from public.organizations o where o.id = new.organization_id;
  end if;
  return new;
end;
$$;

create trigger trucks_odometer_read_on
  before insert or update of odometer, odometer_on on public.trucks
  for each row execute function public.trucks_odometer_read_on();

-- Readings already saved without a date were taken when the truck was last
-- changed, at the latest.
update public.trucks t
set odometer_on = (t.updated_at at time zone o.time_zone)::date
from public.organizations o
where o.id = t.organization_id
  and t.odometer is not null
  and t.odometer_on is null;
