-- The day a load was actually delivered. Reports, pay statements and the
-- truck odometer went by the delivery appointment, so a load delivered early
-- (or late) counted in the wrong week or month.
--
-- delivered_on is set by the database: from the last delivery stop's
-- departure (or arrival) once entered, else the day the load was marked
-- delivered (by POD or Mark complete), but never after its appointment. It's
-- cleared when the load goes back on the road, and follows the stop time
-- when the office corrects it.
--
-- Stop times are moments, so the day depends on where the company is: each
-- organization has a US time zone, Central until it's changed.

alter table public.organizations
  add column time_zone text not null default 'America/Chicago'
    check (time_zone in (
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Phoenix',
      'America/Los_Angeles',
      'America/Anchorage',
      'Pacific/Honolulu'
    ));

alter table public.loads add column delivered_on date;

create index loads_delivered_on_idx
  on public.loads (organization_id, delivered_on)
  where delivered_on is not null;

-- When a load was delivered, worked out from its stops and status.
create function public.load_delivered_on(l public.loads)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select (coalesce(s.departed_at, s.arrived_at) at time zone o.time_zone)::date
      from public.load_stops s
      where s.load_id = l.id
        and s.kind = 'delivery'
        and coalesce(s.departed_at, s.arrived_at) is not null
      order by s.position desc
      limit 1
    ),
    -- No stop time: the day it was marked delivered, unless that's after
    -- the appointment (a POD uploaded days later).
    least(
      (coalesce(l.completed_at, now()) at time zone o.time_zone)::date,
      l.delivery_start::date
    )
  )
  from public.organizations o
  where o.id = l.organization_id
$$;

revoke execute on function public.load_delivered_on(public.loads) from public, anon, authenticated;

-- Security definer to call load_delivered_on, which members can't call
-- directly.
create function public.loads_delivered_on()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status not in ('delivered', 'invoiced', 'paid', 'factored') then
    new.delivered_on := null;
  elsif tg_op = 'INSERT'
     or old.delivered_on is null
     or coalesce(current_setting('officetruck.redate_delivery', true), '') = 'on' then
    new.delivered_on := public.load_delivered_on(new);
  else
    -- Only the database sets it.
    new.delivered_on := old.delivered_on;
  end if;
  return new;
end;
$$;

create trigger loads_delivered_on
  before insert or update on public.loads
  for each row execute function public.loads_delivered_on();

-- A stop time entered or corrected on a delivered load moves its day.
create function public.load_stops_redate_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.load_id, old.load_id);
begin
  if exists (
    select 1 from public.loads
    where id = target and delivered_on is not null
  ) then
    perform set_config('officetruck.redate_delivery', 'on', true);
    update public.loads set delivered_on = null where id = target;
    perform set_config('officetruck.redate_delivery', 'off', true);
  end if;
  return null;
end;
$$;

create trigger load_stops_redate_delivery
  after insert or delete or update of arrived_at, departed_at, kind, position
  on public.load_stops
  for each row execute function public.load_stops_redate_delivery();

-- Loads already delivered, without touching their updated_at or the log.
alter table public.loads disable trigger user;
update public.loads l
set delivered_on = public.load_delivered_on(l)
where l.status in ('delivered', 'invoiced', 'paid', 'factored');
alter table public.loads enable trigger user;
