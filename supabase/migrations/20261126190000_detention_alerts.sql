-- Detention, handled as it happens instead of after the fact:
--
-- * Notices to the broker. Brokers pay detention only when told in time,
--   so while a driver is waiting at a stop, the broker's dispatch contacts
--   get an email 30 minutes before free time runs out, and another when
--   detention starts (asking for their authorization number). They go out
--   through the broker update queue and sender (20261126180000), so a
--   customer whose updates are switched off gets none. If the driver
--   leaves first, the sender drops them.
--
-- * The charge. When the driver leaves a stop past free time, the
--   detention charge is added to the load (billable time rounded up to the
--   quarter hour, at the load's detention rate), noting when they got in
--   and out. The office can change or remove it like any accessorial.
--
-- Both are off until the company turns them on.

alter table public.organizations
  add column detention_notices boolean not null default false,
  add column detention_auto_charge boolean not null default false;

grant update (detention_notices, detention_auto_charge)
  on public.organizations to authenticated;

alter table public.broker_updates drop constraint broker_updates_event_check;
alter table public.broker_updates
  add constraint broker_updates_event_check check (event in (
    'arrived', 'departed', 'delivered', 'detention_soon', 'detention_started'
  ));

-- ------------------------------------------------------------ Notices ---

-- Queues the notices due now for drivers still waiting at a stop. Runs
-- every minute. A notice whose moment passed while nobody ran this (say,
-- the heads-up when detention has already started) is skipped.
create function public.queue_detention_notices()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.broker_updates (organization_id, load_id, stop_id, event)
  select s.organization_id, s.load_id, s.id, notice.event
  from public.load_stops s
  join public.loads l on l.id = s.load_id
  join public.organizations o on o.id = l.organization_id
  left join public.brokers b on b.id = l.broker_id
  cross join lateral (
    select s.arrived_at + make_interval(secs => l.detention_free_hours::double precision * 3600) as free_until
  ) f
  cross join lateral (
    select case
      when now() >= f.free_until then 'detention_started'
      when now() >= f.free_until - interval '30 minutes' then 'detention_soon'
    end as event
  ) notice
  where s.arrived_at is not null
    and s.departed_at is null
    and s.arrived_at > now() - interval '24 hours'
    and l.status in ('dispatched', 'loaded')
    and l.detention_free_hours is not null
    and o.detention_notices
    and coalesce(b.status_updates, true)
    and (l.broker_id is not null or l.rate_con_from is not null)
    and notice.event is not null
  on conflict do nothing;
end;
$$;

revoke execute on function public.queue_detention_notices()
  from public, anon, authenticated;

select cron.schedule(
  'queue-detention-notices',
  '* * * * *',
  'select public.queue_detention_notices()'
);

-- ------------------------------------------------------------- Charge ---

-- Adds the detention charge when the driver leaves a stop past free time,
-- unless the stop's detention is already on the load ("Stop 2: …", as the
-- load page's Add detention button words it). Never fails the check-out.
create function public.load_stops_detention_charge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.loads;
  auto boolean;
  zone text;
  on_site numeric;
  billable numeric;
  amount numeric;
begin
  if old.departed_at is not null or new.departed_at is null or new.arrived_at is null then
    return null;
  end if;
  select * into l from public.loads where id = new.load_id;
  if l.status not in ('dispatched', 'loaded', 'delivered')
     or l.detention_free_hours is null or l.detention_rate is null then
    return null;
  end if;
  select o.detention_auto_charge, o.time_zone into auto, zone
  from public.organizations o where o.id = l.organization_id;
  if not coalesce(auto, false) then
    return null;
  end if;

  on_site := extract(epoch from (new.departed_at - new.arrived_at)) / 3600;
  billable := ceil((on_site - l.detention_free_hours) * 4) / 4;
  if billable <= 0 then
    return null;
  end if;
  amount := round(billable * l.detention_rate, 2);
  if exists (
    select 1 from public.load_charges c
    where c.load_id = l.id and c.kind = 'detention'
      and c.description like 'Stop ' || new.position || ':%'
  ) then
    return null;
  end if;

  insert into public.load_charges
    (organization_id, load_id, kind, description, amount, source, created_by)
  values (
    l.organization_id, l.id, 'detention',
    left(
      'Stop ' || new.position || ': ' || trim(to_char(billable, 'FM990.99')) || ' h past free time (in '
        || to_char(new.arrived_at at time zone coalesce(zone, 'America/Chicago'), 'Mon FMDD FMHH12:MI AM')
        || ', out '
        || to_char(new.departed_at at time zone coalesce(zone, 'America/Chicago'), 'FMHH12:MI AM')
        || ')',
      120
    ),
    amount, 'accessorial', null
  );
  return null;
exception when others then
  raise warning 'detention charge not added: %', sqlerrm;
  return null;
end;
$$;

create trigger load_stops_detention_charge
  after update of departed_at on public.load_stops
  for each row execute function public.load_stops_detention_charge();
