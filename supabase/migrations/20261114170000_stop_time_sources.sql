-- Arrived and departed times come from the driver now, not the office.
--
--   * The driver taps Arrived and Departed on their dispatch link (and, once
--     it exists, in the driver app). The server's clock stamps the time.
--   * The office sees the times, read only. When a driver didn't tap (a dead
--     phone, a time called in), someone in the office can enter the time with
--     a reason, which is logged to the load's history. The office can fix its
--     own entries, never a driver's.
--   * Each time records where it came from (driver, office, or later the
--     ELD), since that's what makes it hold up as detention proof.

-- ------------------------------------------------------------ Columns -----

alter table public.load_stops
  add column arrived_source text check (arrived_source in ('driver', 'office', 'eld')),
  add column departed_source text check (departed_source in ('driver', 'office', 'eld')),
  -- Why the office entered the time, when it did.
  add column arrived_note text check (char_length(arrived_note) <= 200),
  add column departed_note text check (char_length(departed_note) <= 200);

-- Every time so far was tapped in the office app.
update public.load_stops set arrived_source = 'office' where arrived_at is not null;
update public.load_stops set departed_source = 'office' where departed_at is not null;

alter table public.load_stops
  add constraint load_stops_arrived_source_set
    check ((arrived_at is null) = (arrived_source is null)),
  add constraint load_stops_departed_source_set
    check ((departed_at is null) = (departed_source is null));

-- History can record a time entered by the office.
alter table public.load_events drop constraint load_events_kind_check;
alter table public.load_events
  add constraint load_events_kind_check check (kind in (
    'dispatched', 'resent', 'unassigned', 'reopened', 'status', 'stop_time'
  ));

-- ------------------------------------------------------- Stamping -----

-- Sets a stop's arrived or departed time, and moves the load along: leaving
-- the last pickup marks a dispatched load loaded, leaving the last stop
-- marks it delivered. Only the functions below call it; they've already
-- checked who's asking. Raises with a hint the app turns into a message.
create function public.stamp_stop_time(
  target_stop uuid,
  event text,
  stamped timestamptz,
  source text,
  actor uuid,
  note text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.load_stops;
  load_status text;
  last_pickup smallint;
  last_stop smallint;
begin
  select * into s from public.load_stops where id = target_stop for update;
  if s.id is null then
    raise exception 'That stop doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if event not in ('arrived', 'departed') then
    raise exception 'Unknown stop event.' using errcode = '22023', hint = 'bad_event';
  end if;
  if stamped > now() + interval '5 minutes' then
    raise exception 'That time is in the future.' using errcode = '22023', hint = 'future';
  end if;

  select status into load_status from public.loads where id = s.load_id for update;

  if event = 'arrived' then
    -- A time can be replaced only by the office, and only its own entry.
    if s.arrived_at is not null and not (source = 'office' and s.arrived_source = 'office') then
      raise exception 'Arrival is already recorded.' using errcode = '22023', hint = 'already';
    end if;
    if s.departed_at is not null and stamped > s.departed_at then
      raise exception 'Arrival must be before departure.' using errcode = '22023', hint = 'order';
    end if;
    update public.load_stops
    set arrived_at = stamped, arrived_by = actor, arrived_source = source,
        arrived_note = nullif(trim(note), '')
    where id = s.id;
  else
    if s.arrived_at is null then
      raise exception 'Record the arrival first.' using errcode = '22023', hint = 'not_arrived';
    end if;
    if s.departed_at is not null and not (source = 'office' and s.departed_source = 'office') then
      raise exception 'Departure is already recorded.' using errcode = '22023', hint = 'already';
    end if;
    if stamped < s.arrived_at then
      raise exception 'Departure must be after arrival.' using errcode = '22023', hint = 'order';
    end if;
    update public.load_stops
    set departed_at = stamped, departed_by = actor, departed_source = source,
        departed_note = nullif(trim(note), '')
    where id = s.id;
  end if;

  select max(position) filter (where kind = 'pickup'), max(position)
  into last_pickup, last_stop
  from public.load_stops where load_id = s.load_id;

  if event = 'departed' and s.position = last_stop and load_status in ('dispatched', 'loaded') then
    update public.loads set status = 'delivered' where id = s.load_id;
  elsif event = 'departed' and s.position = last_pickup and load_status = 'dispatched' then
    update public.loads set status = 'loaded' where id = s.load_id;
  end if;

  return stamped;
end;
$$;

revoke execute on function public.stamp_stop_time(uuid, text, timestamptz, text, uuid, text)
  from public, anon, authenticated;

-- The office stamping "now" on a stop. Kept for anything still calling it;
-- the load page enters times with set_stop_time instead.
create or replace function public.record_stop_event(target_stop uuid, event text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  load_status text;
begin
  select s.organization_id, l.status into org, load_status
  from public.load_stops s join public.loads l on l.id = s.load_id
  where s.id = target_stop;
  if org is null or not public.is_organization_member(org) then
    raise exception 'That stop doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if load_status in ('booked', 'cancelled', 'tonu') then
    raise exception 'Dispatch the load before checking in at stops.'
      using errcode = '22023', hint = 'not_dispatched';
  end if;
  return public.stamp_stop_time(target_stop, event, now(), 'office', auth.uid(), null);
end;
$$;

-- The driver taps Arrived or Departed on their dispatch link. The stop is
-- found by its number on the load. The link must still be live, and the
-- load on the road.
create function public.record_stop_event_by_token(
  link_token text,
  stop_position integer,
  event text
)
returns timestamptz
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
    raise exception 'Only the driver can check in from this link. Enter the time on the load page instead.'
      using errcode = '42501', hint = 'not_driver';
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

  return public.stamp_stop_time(stop_id, event, now(), 'driver', null, null);
end;
$$;

revoke execute on function public.record_stop_event_by_token(text, integer, text) from public;
grant execute on function public.record_stop_event_by_token(text, integer, text) to anon, authenticated;

-- The load's stops as they are now, for the driver's link: where to check
-- in, and what's already recorded. Null if the link isn't live.
create function public.dispatch_stops(link_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  dp public.load_dispatches;
  load_status text;
begin
  if link_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into dp from public.load_dispatches where token = link_token;
  if dp.id is null or dp.revoked_at is not null then
    return null;
  end if;
  select status into load_status from public.loads where id = dp.load_id;
  return jsonb_build_object(
    'status', load_status,
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', s.position,
        'kind', s.kind,
        'location', s.location,
        'arrived_at', s.arrived_at,
        'departed_at', s.departed_at
      ) order by s.position)
      from public.load_stops s where s.load_id = dp.load_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.dispatch_stops(text) from public;
grant execute on function public.dispatch_stops(text) to anon, authenticated;

-- Someone in the office enters a time the driver didn't record, with the
-- reason. Logged to the load's history.
create function public.set_stop_time(
  target_stop uuid,
  event text,
  at_time timestamptz,
  reason text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.load_stops;
  load_status text;
  stamped timestamptz;
begin
  select * into s from public.load_stops where id = target_stop;
  if s.id is null or not public.is_organization_member(s.organization_id) then
    raise exception 'That stop doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if coalesce(trim(reason), '') = '' then
    raise exception 'Say why you''re entering the time, e.g. "Driver called it in".'
      using errcode = '22023', hint = 'reason';
  end if;
  if char_length(trim(reason)) > 200 then
    raise exception 'Keep the reason to 200 characters or fewer.'
      using errcode = '22023', hint = 'reason';
  end if;

  select status into load_status from public.loads where id = s.load_id;
  if load_status in ('booked', 'cancelled') then
    raise exception 'Times can be entered once the load is dispatched.'
      using errcode = '22023', hint = 'not_dispatched';
  end if;

  stamped := public.stamp_stop_time(target_stop, event, at_time, 'office', auth.uid(), reason);

  insert into public.load_events (organization_id, load_id, kind, detail)
  values (
    s.organization_id, s.load_id, 'stop_time',
    format('Stop %s %s entered by the office: %s',
      s.position,
      case when event = 'arrived' then 'arrival' else 'departure' end,
      trim(reason))
  );

  return stamped;
end;
$$;

revoke execute on function public.set_stop_time(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.set_stop_time(uuid, text, timestamptz, text) to authenticated;
