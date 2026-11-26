-- Automatic status updates to the broker: when a driver checks in or out at
-- a stop (or the office enters the time), and when a load is delivered, the
-- broker's dispatch contacts get a short email, so nobody has to answer
-- "where's my truck?" calls by hand. Never the rate or charges.
--
-- Off unless a company turns it on (organizations.broker_updates), and each
-- customer can follow that default or be switched on or off on their own
-- (brokers.status_updates: null follows the company).
--
-- Triggers queue an update here; the web app sends what's queued
-- (/api/cron/broker-updates), records each send on the load's history and
-- marks the row sent. pg_cron calls that route every minute through pg_net,
-- once the app's address and the cron secret are saved in Vault as
-- 'app_url' and 'cron_secret'. Queuing never fails a check-in.

alter table public.organizations
  add column broker_updates boolean not null default false;

grant update (broker_updates) on public.organizations to authenticated;

alter table public.brokers
  add column status_updates boolean;

-- ------------------------------------------------------------ Queue -----

create table public.broker_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  load_id uuid not null,
  -- The stop for an arrival or departure; null for the load's delivery.
  stop_id uuid references public.load_stops (id) on delete cascade,
  event text not null check (event in ('arrived', 'departed', 'delivered')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_to text[],
  attempts smallint not null default 0,
  last_error text,
  foreign key (organization_id, load_id)
    references public.loads (organization_id, id) on delete cascade,
  check ((event = 'delivered') = (stop_id is null))
);

-- One update per stop event, and one delivery per load.
create unique index broker_updates_stop_event_key
  on public.broker_updates (stop_id, event) where stop_id is not null;
create unique index broker_updates_delivered_key
  on public.broker_updates (load_id) where event = 'delivered';
create index broker_updates_pending_idx
  on public.broker_updates (created_at) where sent_at is null;

alter table public.broker_updates enable row level security;

-- Members can see what was sent for their loads; only the server sends.
grant select on public.broker_updates to authenticated;

create policy "Members can see their broker updates"
  on public.broker_updates for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

-- History records each update sent.
alter table public.load_events drop constraint load_events_kind_check;
alter table public.load_events
  add constraint load_events_kind_check check (kind in (
    'dispatched', 'resent', 'unassigned', 'reopened', 'status', 'stop_time',
    'broker_update'
  ));

-- Queues an update for a load's broker, if updates are on for them and
-- there's someone to send it to (a broker with contacts, or whoever sent
-- the rate con). Called by the triggers below.
create function public.queue_broker_update(
  target_load uuid,
  target_stop uuid,
  what text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.loads;
  wanted boolean;
begin
  select * into l from public.loads where id = target_load;
  if l.id is null or l.status in ('cancelled', 'tonu', 'booked') then
    return;
  end if;
  select coalesce(b.status_updates, o.broker_updates, false) into wanted
  from public.organizations o
  left join public.brokers b on b.id = l.broker_id
  where o.id = l.organization_id;
  if not coalesce(wanted, false) then
    return;
  end if;
  if l.broker_id is null and l.rate_con_from is null then
    return;
  end if;
  insert into public.broker_updates (organization_id, load_id, stop_id, event)
  values (l.organization_id, l.id, target_stop, what)
  on conflict do nothing;
exception when others then
  -- Never fail the check-in or delivery over an update.
  raise warning 'broker update not queued: %', sqlerrm;
end;
$$;

revoke execute on function public.queue_broker_update(uuid, uuid, text)
  from public, anon, authenticated;

-- A stop's first arrival or departure. Times backfilled more than a day
-- later are history, not news, so they're left out.
create function public.load_stops_queue_broker_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.arrived_at is null and new.arrived_at is not null
     and new.arrived_at > now() - interval '24 hours' then
    perform public.queue_broker_update(new.load_id, new.id, 'arrived');
  end if;
  if old.departed_at is null and new.departed_at is not null
     and new.departed_at > now() - interval '24 hours' then
    perform public.queue_broker_update(new.load_id, new.id, 'departed');
  end if;
  return null;
end;
$$;

create trigger load_stops_queue_broker_update
  after update of arrived_at, departed_at on public.load_stops
  for each row execute function public.load_stops_queue_broker_update();

-- A load delivered some other way than checking out of its last stop (the
-- POD came in, or Mark complete). Checking out already sent the news.
create function public.loads_queue_broker_delivered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered'
     and old.status in ('dispatched', 'loaded')
     and not exists (
       select 1
       from public.broker_updates u
       join public.load_stops s on s.id = u.stop_id
       where u.load_id = new.id
         and u.event = 'departed'
         and s.position = (select max(position) from public.load_stops where load_id = new.id)
     ) then
    perform public.queue_broker_update(new.id, null, 'delivered');
  end if;
  return null;
end;
$$;

create trigger loads_queue_broker_delivered
  after update of status on public.loads
  for each row execute function public.loads_queue_broker_delivered();

-- ------------------------------------------------------------ Sending ---

create extension if not exists pg_net;

-- Asks the web app to send what's queued, when there's anything to send
-- and Vault has the app's address and the cron secret. Runs every minute.
create function public.kick_broker_updates()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  secret text;
begin
  if not exists (
    select 1 from public.broker_updates
    where sent_at is null and attempts < 5
      and created_at > now() - interval '2 days'
  ) then
    return;
  end if;
  select decrypted_secret into base from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if base is null or secret is null then
    return;
  end if;
  perform net.http_get(
    url := rtrim(base, '/') || '/api/cron/broker-updates',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret)
  );
end;
$$;

revoke execute on function public.kick_broker_updates()
  from public, anon, authenticated;

select cron.schedule(
  'send-broker-updates',
  '* * * * *',
  'select public.kick_broker_updates()'
);
