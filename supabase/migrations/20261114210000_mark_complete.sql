-- Statuses move on their own; the office has one override, Mark complete.
--
--   * In transit (loaded) and Delivered are set only by what happens: the
--     BOL and POD, the driver's check-ins, or Mark complete. Picking them by
--     hand is refused.
--   * Mark complete sets a load on the road to Delivered by hand, for when
--     the POD or check-in never comes. The load is flagged completed by hand
--     (shown as "Delivered · Manual"), which removing documents won't undo.
--     The flag clears once real proof arrives (a POD, or the driver
--     departing the last stop), and when the load leaves Delivered for
--     booked, canceled or TONU.
--   * Cancel, TONU, Reopen, and Invoiced / Paid / Factored (until invoicing
--     and payments exist) stay manual.

alter table public.loads
  add column completed_manually boolean not null default false,
  add column completed_by uuid references auth.users (id) on delete set null,
  add column completed_at timestamptz;

-- ------------------------------------------------------ Status rules -----

create or replace function public.loads_status_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  flow text[] := array['booked', 'dispatched', 'loaded', 'delivered', 'invoiced', 'paid', 'factored'];
  on_the_road text[] := array['dispatched', 'loaded', 'delivered'];
  reason text := coalesce(current_setting('officetruck.status_reason', true), '');
  old_i integer := array_position(flow, old.status);
  new_i integer := array_position(flow, new.status);
  from_documents boolean :=
    reason = 'documents'
    and old.status = any (on_the_road)
    and new.status = any (on_the_road);
begin
  if new.status is distinct from old.status then
    if new.status = 'dispatched' and reason <> 'dispatched' and not from_documents then
      raise exception 'Use Send to driver to dispatch a load.'
        using errcode = '42501', hint = 'dispatch_only';
    end if;

    -- In transit and Delivered come from what happens, or Mark complete.
    if new.status in ('loaded', 'delivered')
       and reason not in ('documents', 'checkin', 'completed') then
      raise exception 'In transit and Delivered are set from the BOL, POD and check-ins. Use Mark complete if they won''t come.'
        using errcode = '42501', hint = 'automatic_only';
    end if;

    if old_i is not null and new_i is not null and new_i < old_i
       and not (reason = 'unassigned' and old.status = 'dispatched' and new.status = 'booked')
       and not from_documents then
      raise exception 'A load''s status only moves forward. To send a dispatched load back to booked, unassign it.'
        using errcode = '42501', hint = 'backward';
    end if;

    if old_i is null and new_i is not null
       and not (reason = 'reopened' and new.status = 'booked') then
      raise exception 'Reopen a canceled load to put it back to booked.'
        using errcode = '42501', hint = 'reopen_only';
    end if;
  end if;

  -- Only Mark complete sets the flag; anything leaving the delivered end of
  -- the flow clears it.
  if new.completed_manually and not old.completed_manually and reason <> 'completed' then
    new.completed_manually := false;
  end if;
  if new.status in ('booked', 'dispatched', 'loaded', 'cancelled', 'tonu') then
    new.completed_manually := false;
    new.completed_by := null;
    new.completed_at := null;
  elsif not new.completed_manually then
    new.completed_by := null;
    new.completed_at := null;
  elsif reason <> 'completed' then
    new.completed_by := old.completed_by;
    new.completed_at := old.completed_at;
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

-- ---------------------------------------------- Status from documents -----

-- As before, plus: a load completed by hand stays delivered, and real proof
-- of delivery clears the Manual flag.
create or replace function public.sync_load_status_from_documents(target_load uuid, why text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.loads;
  level integer;
  target_status text;
  last_pickup smallint;
  last_stop smallint;
begin
  select * into l from public.loads where id = target_load for update;
  if l.id is null or l.status not in ('dispatched', 'loaded', 'delivered') then
    return;
  end if;

  select max(position) filter (where kind = 'pickup'), max(position)
  into last_pickup, last_stop
  from public.load_stops where load_id = target_load;

  select greatest(
    case
      when exists (select 1 from public.load_documents where load_id = target_load and kind = 'pod') then 2
      when exists (select 1 from public.load_documents where load_id = target_load and kind = 'bol') then 1
      else 0
    end,
    case
      when exists (select 1 from public.load_stops
                   where load_id = target_load and position = last_stop and departed_at is not null) then 2
      when exists (select 1 from public.load_stops
                   where load_id = target_load and position = last_pickup and departed_at is not null) then 1
      else 0
    end
  ) into level;

  -- Real proof of delivery: it's no longer a manual completion.
  if level = 2 and l.completed_manually then
    perform set_config('officetruck.status_reason', 'documents', true);
    update public.loads set completed_manually = false where id = target_load;
    perform set_config('officetruck.status_reason', '', true);
    l.completed_manually := false;
  end if;
  if l.completed_manually then
    level := 2;
  end if;

  target_status := case level when 2 then 'delivered' when 1 then 'loaded' else 'dispatched' end;

  if target_status <> l.status then
    perform set_config('officetruck.status_reason', 'documents', true);
    perform set_config('officetruck.status_detail', why, true);
    update public.loads set status = target_status where id = target_load;
    perform set_config('officetruck.status_reason', '', true);
    perform set_config('officetruck.status_detail', '', true);
  end if;
end;
$$;

-- ------------------------------------------------------- Check-ins -----

-- As before, with the move logged as a check-in, and departing the last
-- stop clearing a manual completion (it's real proof of delivery).
create or replace function public.stamp_stop_time(
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
  next_status text;
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
    next_status := 'delivered';
  elsif event = 'departed' and s.position = last_pickup and load_status = 'dispatched' then
    next_status := 'loaded';
  end if;

  perform set_config('officetruck.status_reason', 'checkin', true);
  if next_status is not null then
    perform set_config('officetruck.status_detail', format('Departed stop %s', s.position), true);
    update public.loads set status = next_status where id = s.load_id;
    perform set_config('officetruck.status_detail', '', true);
  end if;
  if event = 'departed' and s.position = last_stop then
    update public.loads set completed_manually = false
    where id = s.load_id and completed_manually;
  end if;
  perform set_config('officetruck.status_reason', '', true);

  return stamped;
end;
$$;

-- ---------------------------------------------------- Mark complete -----

-- The office marks a load on the road delivered by hand. Logged.
create function public.mark_load_complete(target_load uuid)
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
  if l.status not in ('dispatched', 'loaded') then
    raise exception 'Only a load on the road can be marked complete.'
      using errcode = '42501', hint = 'not_on_the_road';
  end if;

  perform set_config('officetruck.status_reason', 'completed', true);
  perform set_config('officetruck.status_detail', 'Marked complete by hand', true);
  update public.loads
  set status = 'delivered',
      completed_manually = true,
      completed_by = auth.uid(),
      completed_at = now()
  where id = target_load;
  perform set_config('officetruck.status_reason', '', true);
  perform set_config('officetruck.status_detail', '', true);
end;
$$;

revoke execute on function public.mark_load_complete(uuid) from public, anon;
grant execute on function public.mark_load_complete(uuid) to authenticated;
