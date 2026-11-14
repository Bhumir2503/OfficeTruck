-- Undo complete: take back a Mark complete.
--
-- A load completed by hand goes back to where it really is: booked, if it
-- was completed straight from booked; otherwise wherever its BOL, POD and
-- check-ins put it (dispatched or in transit). Only while it's still
-- delivered and still flagged as completed by hand: once it's invoiced, or
-- real proof of delivery came in, there's nothing to undo. Logged.

alter table public.loads
  add column completed_from text check (completed_from in ('booked', 'dispatched', 'loaded'));

-- ---------------------------------------------------- Status rules -----

-- As before, plus one way back: Undo complete on a load completed from
-- booked.
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
       and not (reason = 'uncompleted' and old.status = 'delivered' and new.status = 'booked')
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

-- ---------------------------------------------------- Mark complete -----

-- As before, remembering the status it was completed from.
create or replace function public.mark_load_complete(target_load uuid)
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
  if l.status not in ('booked', 'dispatched', 'loaded') then
    raise exception 'Only a load that hasn''t been delivered can be marked complete.'
      using errcode = '42501', hint = 'not_completable';
  end if;

  perform set_config('officetruck.status_reason', 'completed', true);
  perform set_config('officetruck.status_detail', 'Marked complete by hand', true);
  update public.loads
  set status = 'delivered',
      completed_manually = true,
      completed_by = auth.uid(),
      completed_at = now(),
      completed_from = l.status
  where id = target_load;
  perform set_config('officetruck.status_reason', '', true);
  perform set_config('officetruck.status_detail', '', true);
end;
$$;

-- ---------------------------------------------------- Undo complete -----

create function public.unmark_load_complete(target_load uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.loads;
  now_status text;
begin
  select * into l from public.loads where id = target_load for update;
  if l.id is null or not public.is_organization_member(l.organization_id) then
    raise exception 'That load doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if not l.completed_manually or l.status <> 'delivered' then
    raise exception 'Only a load marked complete by hand, and not yet invoiced, can be undone.'
      using errcode = '42501', hint = 'not_completed';
  end if;

  if coalesce(l.completed_from, 'dispatched') = 'booked' then
    perform set_config('officetruck.status_reason', 'uncompleted', true);
    perform set_config('officetruck.status_detail', 'Completion undone', true);
    update public.loads
    set status = 'booked', completed_manually = false, completed_from = null
    where id = target_load;
    perform set_config('officetruck.status_reason', '', true);
    perform set_config('officetruck.status_detail', '', true);
  else
    -- Drop the flag, then let the documents and check-ins say where it is.
    update public.loads
    set completed_manually = false, completed_from = null
    where id = target_load;
    perform public.sync_load_status_from_documents(target_load, 'Completion undone');
  end if;

  select status into now_status from public.loads where id = target_load;
  return now_status;
end;
$$;

revoke execute on function public.unmark_load_complete(uuid) from public, anon;
grant execute on function public.unmark_load_complete(uuid) to authenticated;
