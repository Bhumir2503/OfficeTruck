-- Assigning a load notifies the driver; drivers don't accept.
--
--   * assign_load saves the truck, driver and miles in one go. When that
--     leaves a load with a truck and driver that hasn't been sent to them
--     (a booked load, or a dispatched one whose driver changed), it notifies
--     the driver: the same send as dispatch_load. Replacing or removing a
--     dispatched load's driver first takes the old one off (their link stops
--     working, and the load goes back to booked for a moment), so they can
--     be told. Nothing is sent except from this save.
--   * assignment_conflicts lists this company's other loads that would
--     overlap in time with the chosen truck or driver, for a warning before
--     saving. It never blocks anything.
--   * The accept step is gone: the office assigns, the driver doesn't accept.
--     accepted_at stays on old dispatches as a record.

-- ------------------------------------------------ Notification email -----

-- Whether the email with the driver's link failed to send, so the office is
-- offered Resend and Copy link straight away.
alter table public.load_dispatches
  add column email_failed boolean not null default false;

-- Records how the email with the load's live link went. Called by the app
-- right after it tries to send it.
create function public.record_dispatch_email(target_load uuid, failed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
begin
  select organization_id into org from public.loads where id = target_load;
  if org is null or not public.is_organization_member(org) then
    raise exception 'That load doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  update public.load_dispatches
  set email_failed = failed
  where load_id = target_load and revoked_at is null;
end;
$$;

revoke execute on function public.record_dispatch_email(uuid, boolean) from public, anon;
grant execute on function public.record_dispatch_email(uuid, boolean) to authenticated;

-- ----------------------------------------------------------- Assign -----

create function public.assign_load(
  target_load uuid,
  new_truck uuid,
  new_driver uuid,
  new_miles integer,
  new_empty_miles integer
)
returns table (
  -- The driver taken off, to tell them. Null when no one was.
  removed_email text,
  removed_name text,
  -- The driver notified, and their link's token. Null when no one was.
  token text,
  email_to text,
  driver_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.loads;
  driver_changed boolean;
  now_status text;
begin
  select * into l from public.loads where id = target_load for update;
  if l.id is null or not public.is_organization_member(l.organization_id) then
    raise exception 'That load doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;

  driver_changed := new_driver is distinct from l.driver_id;
  if driver_changed and l.status not in ('booked', 'dispatched') then
    raise exception 'The driver can''t be changed once the load is in transit.'
      using errcode = '42501', hint = 'driver_locked';
  end if;

  -- A dispatched load's driver has the load: take them off first, so their
  -- link stops working and they can be told.
  if driver_changed and l.status = 'dispatched' then
    select u.email_to, u.driver_name into removed_email, removed_name
    from public.unassign_load(target_load) u;
  end if;

  update public.loads
  set truck_id = new_truck,
      driver_id = new_driver,
      miles = new_miles,
      empty_miles = new_empty_miles
  where id = target_load;

  select status into now_status from public.loads where id = target_load;

  -- Notify when the load has a truck and driver and hasn't gone to them.
  if new_driver is not null and new_truck is not null and now_status = 'booked' then
    select d.token, d.email_to, d.driver_name into token, email_to, driver_name
    from public.dispatch_load(target_load) d;
  end if;

  return next;
end;
$$;

revoke execute on function public.assign_load(uuid, uuid, uuid, integer, integer) from public, anon;
grant execute on function public.assign_load(uuid, uuid, uuid, integer, integer) to authenticated;

-- ------------------------------------------------------- Conflicts -----

-- This company's other loads still on the schedule whose time on the road
-- overlaps this load's, for the given truck and for the given driver.
-- Wall-clock times, compared to the minute, like the app's overlap check.
-- Runs as the caller, so row-level security keeps it to their company too.
create function public.assignment_conflicts(
  target_load uuid,
  for_truck uuid,
  for_driver uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with this as (
    select id, organization_id,
           date_trunc('minute', pickup_start) as starts,
           date_trunc('minute', coalesce(delivery_end, delivery_start)) as ends
    from public.loads
    where id = target_load
  ),
  others as (
    select o.id, o.reference, o.truck_id, o.driver_id, o.pickup_start
    from public.loads o, this
    where o.organization_id = this.organization_id
      and o.id <> this.id
      and o.status in ('booked', 'dispatched', 'loaded')
      and date_trunc('minute', o.pickup_start) < this.ends
      and this.starts < date_trunc('minute', coalesce(o.delivery_end, o.delivery_start))
  )
  select case when exists (select 1 from this) then jsonb_build_object(
    'driver', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'reference', reference) order by pickup_start)
      from others where for_driver is not null and driver_id = for_driver
    ), '[]'::jsonb),
    'truck', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'reference', reference) order by pickup_start)
      from others where for_truck is not null and truck_id = for_truck
    ), '[]'::jsonb)
  ) end;
$$;

revoke execute on function public.assignment_conflicts(uuid, uuid, uuid) from public, anon;
grant execute on function public.assignment_conflicts(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------- No accepting -----

drop function public.accept_dispatch(text);
