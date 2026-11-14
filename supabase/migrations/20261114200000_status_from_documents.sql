-- On the road, a load's status follows what's actually there, both ways.
--
-- Between dispatched and delivered, the status is worked out from the
-- load's documents and the driver's check-ins, whichever is further along:
--
--   * a POD, or the driver departed the last stop    → delivered
--   * a BOL, or the driver departed the last pickup  → loaded (In transit)
--   * neither                                         → dispatched
--
-- It's worked out again whenever a document is added or removed, so a BOL
-- uploaded into the POD slot by mistake marks the load delivered, and
-- removing it puts the load back. Loads that are booked, invoiced, paid,
-- factored, canceled or TONU are never touched.
--
-- This replaces the forward-only move from 20261114190000.

-- ---------------------------------------------------- Status rules -----

-- Same rules as before, plus one exception: the documents can move a load
-- back within dispatched → loaded → delivered.
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

-- ------------------------------------------- Status from documents -----

-- Works out where a load on the road is from its documents and check-ins,
-- and moves it there (either way), logging `why`.
create function public.sync_load_status_from_documents(target_load uuid, why text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
  level integer;
  target_status text;
  last_pickup smallint;
  last_stop smallint;
begin
  select status into current_status from public.loads where id = target_load for update;
  -- Gone (the load was deleted with its documents) or not on the road.
  if current_status is null or current_status not in ('dispatched', 'loaded', 'delivered') then
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

  target_status := case level when 2 then 'delivered' when 1 then 'loaded' else 'dispatched' end;

  if target_status <> current_status then
    perform set_config('officetruck.status_reason', 'documents', true);
    perform set_config('officetruck.status_detail', why, true);
    update public.loads set status = target_status where id = target_load;
    perform set_config('officetruck.status_reason', '', true);
    perform set_config('officetruck.status_detail', '', true);
  end if;
end;
$$;

revoke execute on function public.sync_load_status_from_documents(uuid, text)
  from public, anon, authenticated;

create function public.load_documents_sync_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.load_documents := case when tg_op = 'DELETE' then old else new end;
  label text := case doc.kind when 'bol' then 'BOL' when 'pod' then 'POD' end;
begin
  -- Only the BOL and POD say where the freight is.
  if label is not null then
    perform public.sync_load_status_from_documents(
      doc.load_id,
      label || case when tg_op = 'DELETE' then ' removed' else ' uploaded' end
    );
  end if;
  return null;
end;
$$;

revoke execute on function public.load_documents_sync_status() from public, anon, authenticated;

drop trigger load_documents_move_status on public.load_documents;
drop function public.load_documents_move_status();

create trigger load_documents_sync_status
  after insert or delete on public.load_documents
  for each row execute function public.load_documents_sync_status();
