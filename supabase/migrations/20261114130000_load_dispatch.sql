-- Dispatching loads to drivers.
--
--   * Assigning a truck and driver leaves a load Booked.
--   * "Send to driver" (dispatch_load) records what was sent, gives the
--     driver a private link, and moves the load to Dispatched. Only it can.
--   * The driver opening or accepting the link is recorded on the dispatch,
--     as a checkmark, not a status.
--   * Unassigning a dispatched load (unassign_load) sends it back to Booked.
--     That and reopening a canceled or TONU load (reopen_load) are the only
--     backward moves, and every status change is logged in load_events.

-- ------------------------------------------------------- Setting -----

-- Whether drivers see the rate and charges on what they're sent. Off by
-- default: many owners keep the rate from drivers.
alter table public.organizations
  add column share_rate_with_drivers boolean not null default false;

grant update (share_rate_with_drivers) on public.organizations to authenticated;

-- ------------------------------------------------------ Dispatches -----

create table public.load_dispatches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  load_id uuid not null,
  driver_id uuid,
  -- The private link's token: 64 random hex characters.
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  -- Where it was emailed, if the driver had an email address.
  email_to text,
  -- Exactly what the driver was sent, so later edits to the load don't
  -- change it. The rate is in it only if include_rate.
  packet jsonb not null,
  include_rate boolean not null,
  sent_at timestamptz not null default now(),
  sent_by uuid references auth.users (id) on delete set null,
  -- Set from the driver's link.
  seen_at timestamptz,
  accepted_at timestamptz,
  -- Set when the load is unassigned, or sent again (which replaces it).
  revoked_at timestamptz,
  foreign key (organization_id, load_id)
    references public.loads (organization_id, id) on delete cascade,
  foreign key (organization_id, driver_id)
    references public.drivers (organization_id, id)
);

-- At most one live dispatch per load.
create unique index load_dispatches_live_idx
  on public.load_dispatches (load_id) where revoked_at is null;

alter table public.load_dispatches enable row level security;

-- Written only by the functions below.
grant select on public.load_dispatches to authenticated;

create policy "Members can view their organization's dispatches"
  on public.load_dispatches for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

-- -------------------------------------------------------- Events -----

create table public.load_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  load_id uuid not null,
  -- dispatched, resent, unassigned, reopened, or status (any other change).
  kind text not null check (kind in ('dispatched', 'resent', 'unassigned', 'reopened', 'status')),
  from_status text,
  to_status text,
  detail text check (char_length(detail) <= 500),
  actor uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, load_id)
    references public.loads (organization_id, id) on delete cascade
);

create index load_events_load_idx on public.load_events (load_id, created_at desc);

alter table public.load_events enable row level security;

-- Written only by the trigger and functions below: a log isn't edited.
grant select on public.load_events to authenticated;

create policy "Members can view their organization's load history"
  on public.load_events for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

-- --------------------------------------------------- Status rules -----

-- Statuses move forward through the flow, or off it to canceled or TONU.
-- The functions below set officetruck.status_reason for their own
-- transaction to make the moves only they may make.
create function public.loads_status_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  flow text[] := array['booked', 'dispatched', 'loaded', 'delivered', 'invoiced', 'paid', 'factored'];
  reason text := coalesce(current_setting('officetruck.status_reason', true), '');
  old_i integer := array_position(flow, old.status);
  new_i integer := array_position(flow, new.status);
begin
  if new.status is distinct from old.status then
    if new.status = 'dispatched' and reason <> 'dispatched' then
      raise exception 'Use Send to driver to dispatch a load.'
        using errcode = '42501', hint = 'dispatch_only';
    end if;

    if old_i is not null and new_i is not null and new_i < old_i
       and not (reason = 'unassigned' and old.status = 'dispatched' and new.status = 'booked') then
      raise exception 'A load''s status only moves forward. To send a dispatched load back to booked, unassign it.'
        using errcode = '42501', hint = 'backward';
    end if;

    if old_i is null and new_i is not null
       and not (reason = 'reopened' and new.status = 'booked') then
      raise exception 'Reopen a canceled load to put it back to booked.'
        using errcode = '42501', hint = 'reopen_only';
    end if;
  end if;

  -- A dispatched load's driver has been sent it, so swapping them takes an
  -- unassign (which tells them) first.
  if old.status = 'dispatched' and new.status = 'dispatched'
     and new.driver_id is distinct from old.driver_id then
    raise exception 'Unassign the load before changing its driver.'
      using errcode = '42501', hint = 'unassign_first';
  end if;

  return new;
end;
$$;

create trigger loads_status_rules
  before update on public.loads
  for each row execute function public.loads_status_rules();

-- Logs every status change. Security definer: members can't write the log
-- directly.
create function public.loads_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reason text := coalesce(current_setting('officetruck.status_reason', true), '');
begin
  if new.status is distinct from old.status then
    insert into public.load_events (organization_id, load_id, kind, from_status, to_status, detail)
    values (
      new.organization_id, new.id,
      case when reason in ('dispatched', 'unassigned', 'reopened') then reason else 'status' end,
      old.status, new.status,
      nullif(current_setting('officetruck.status_detail', true), '')
    );
  end if;
  return new;
end;
$$;

create trigger loads_log_status
  after update on public.loads
  for each row execute function public.loads_log_status();

-- ------------------------------------------------------ Functions -----

-- What the driver is sent: the stops, appointments and numbers, the freight,
-- and the rate con only if the company shares rates with drivers.
create function public.load_dispatch_packet(target_load uuid, include_rate boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'reference', l.reference,
    'broker_name', l.broker_name,
    'reference_numbers', l.reference_numbers,
    'equipment', l.equipment,
    'commodity', l.commodity,
    'weight_lbs', l.weight_lbs,
    'trailer_number', l.trailer_number,
    'notes', l.notes,
    'miles', l.miles,
    'truck', (select t.unit_number from public.trucks t where t.id = l.truck_id),
    'driver', (select d.full_name from public.drivers d where d.id = l.driver_id),
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', s.position,
        'kind', s.kind,
        'location', s.location,
        'appointment_start', s.appointment_start,
        'appointment_end', s.appointment_end,
        'stop_number', s.stop_number,
        'notes', s.notes
      ) order by s.position)
      from public.load_stops s where s.load_id = l.id
    ), '[]'::jsonb),
    'rate', case when include_rate then jsonb_build_object(
      'total', l.rate,
      'detention_free_hours', l.detention_free_hours,
      'detention_rate', l.detention_rate,
      'charges', coalesce((
        select jsonb_agg(jsonb_build_object(
          'kind', c.kind, 'description', c.description, 'amount', c.amount
        ) order by c.position)
        from public.load_charges c where c.load_id = l.id
      ), '[]'::jsonb)
    ) end
  )
  from public.loads l
  where l.id = target_load;
$$;

revoke execute on function public.load_dispatch_packet(uuid, boolean) from public, anon, authenticated;

-- Sends (or re-sends) a load to its driver. Returns the dispatch's token and
-- the driver's email, for the app to email the link. Errors carry a hint the
-- app turns into a message.
create function public.dispatch_load(target_load uuid)
returns table (token text, email_to text, driver_name text, resent boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.loads;
  d public.drivers;
  share boolean;
  new_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  was_dispatched boolean;
begin
  select * into l from public.loads where id = target_load for update;
  if l.id is null or not public.is_organization_member(l.organization_id) then
    raise exception 'That load doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if l.status not in ('booked', 'dispatched') then
    raise exception 'Only booked loads can be sent to a driver.'
      using errcode = '42501', hint = 'not_dispatchable';
  end if;
  if l.driver_id is null or l.truck_id is null then
    raise exception 'Assign a truck and driver before sending the load.'
      using errcode = '23514', hint = 'needs_assignment';
  end if;

  select * into d from public.drivers where id = l.driver_id;
  select o.share_rate_with_drivers into share from public.organizations o where o.id = l.organization_id;
  was_dispatched := l.status = 'dispatched';

  -- A new send replaces the last one; its link stops working.
  update public.load_dispatches set revoked_at = now()
  where load_id = l.id and revoked_at is null;

  insert into public.load_dispatches
    (organization_id, load_id, driver_id, token, email_to, packet, include_rate, sent_by)
  values
    (l.organization_id, l.id, l.driver_id, new_token, d.email,
     public.load_dispatch_packet(l.id, share), share, auth.uid());

  if was_dispatched then
    insert into public.load_events (organization_id, load_id, kind, from_status, to_status, detail)
    values (l.organization_id, l.id, 'resent', l.status, l.status, 'Sent again to ' || d.full_name);
  else
    perform set_config('officetruck.status_reason', 'dispatched', true);
    perform set_config('officetruck.status_detail', 'Sent to ' || d.full_name, true);
    update public.loads set status = 'dispatched' where id = l.id;
    perform set_config('officetruck.status_reason', '', true);
    perform set_config('officetruck.status_detail', '', true);
  end if;

  return query select new_token, d.email, d.full_name, was_dispatched;
end;
$$;

revoke execute on function public.dispatch_load(uuid) from public, anon;
grant execute on function public.dispatch_load(uuid) to authenticated;

-- Takes the truck and driver off a dispatched load and sends it back to
-- Booked. Returns who was on it, for the app to tell them.
create function public.unassign_load(target_load uuid)
returns table (email_to text, driver_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.loads;
  d public.drivers;
begin
  select * into l from public.loads where id = target_load for update;
  if l.id is null or not public.is_organization_member(l.organization_id) then
    raise exception 'That load doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if l.status <> 'dispatched' then
    raise exception 'Only dispatched loads can be unassigned this way.'
      using errcode = '42501', hint = 'not_dispatched';
  end if;

  select * into d from public.drivers where id = l.driver_id;

  update public.load_dispatches set revoked_at = now()
  where load_id = l.id and revoked_at is null;

  perform set_config('officetruck.status_reason', 'unassigned', true);
  perform set_config('officetruck.status_detail',
    'Unassigned ' || coalesce(d.full_name, 'the driver'), true);
  update public.loads
  set status = 'booked', driver_id = null, truck_id = null
  where id = l.id;
  perform set_config('officetruck.status_reason', '', true);
  perform set_config('officetruck.status_detail', '', true);

  return query select d.email, d.full_name;
end;
$$;

revoke execute on function public.unassign_load(uuid) from public, anon;
grant execute on function public.unassign_load(uuid) to authenticated;

-- Puts a canceled or TONU load back to Booked, when it was a mistake.
create function public.reopen_load(target_load uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.loads;
begin
  select * into l from public.loads where id = target_load for update;
  if l.id is null or not public.is_organization_member(l.organization_id) then
    raise exception 'That load doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if l.status not in ('cancelled', 'tonu') then
    raise exception 'Only canceled or TONU loads can be reopened.'
      using errcode = '42501', hint = 'not_reopenable';
  end if;

  perform set_config('officetruck.status_reason', 'reopened', true);
  update public.loads set status = 'booked' where id = l.id;
  perform set_config('officetruck.status_reason', '', true);
end;
$$;

revoke execute on function public.reopen_load(uuid) from public, anon;
grant execute on function public.reopen_load(uuid) to authenticated;

-- ------------------------------------------------ Driver's link -----

-- The driver's view of a dispatch, by its token. Anyone with the link can
-- open it, signed in or not; the first open is recorded as "seen".
create function public.open_dispatch(link_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  dp public.load_dispatches;
  org_name text;
begin
  if link_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into dp from public.load_dispatches where token = link_token;
  if dp.id is null then
    return null;
  end if;

  -- Someone in the company checking the link (say, before texting it) isn't
  -- the driver seeing it.
  if dp.seen_at is null and dp.revoked_at is null
     and not public.is_organization_member(dp.organization_id) then
    update public.load_dispatches set seen_at = now() where id = dp.id
    returning * into dp;
  end if;

  select name into org_name from public.organizations where id = dp.organization_id;

  return jsonb_build_object(
    'organization', org_name,
    'packet', case when dp.revoked_at is null then dp.packet end,
    'sent_at', dp.sent_at,
    'seen_at', dp.seen_at,
    'accepted_at', dp.accepted_at,
    'revoked', dp.revoked_at is not null
  );
end;
$$;

revoke execute on function public.open_dispatch(text) from public;
grant execute on function public.open_dispatch(text) to anon, authenticated;

-- The driver accepting the load from their link.
create function public.accept_dispatch(link_token text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  dp public.load_dispatches;
begin
  if link_token !~ '^[0-9a-f]{64}$' then
    raise exception 'That link isn''t valid.' using errcode = 'P0002', hint = 'not_found';
  end if;
  select * into dp from public.load_dispatches where token = link_token for update;
  if dp.id is null then
    raise exception 'That link isn''t valid.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if dp.revoked_at is not null then
    raise exception 'This load was taken off your schedule.'
      using errcode = '42501', hint = 'revoked';
  end if;
  if public.is_organization_member(dp.organization_id) then
    raise exception 'Only the driver can accept the load. You''re signed in to the company that sent it.'
      using errcode = '42501', hint = 'not_driver';
  end if;

  update public.load_dispatches
  set accepted_at = coalesce(accepted_at, now()),
      seen_at = coalesce(seen_at, now())
  where id = dp.id
  returning accepted_at into dp.accepted_at;
  return dp.accepted_at;
end;
$$;

revoke execute on function public.accept_dispatch(text) from public;
grant execute on function public.accept_dispatch(text) to anon, authenticated;
