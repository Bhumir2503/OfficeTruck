-- Change the driver's pay on one load: a short haul, a hard run paid extra,
-- or a flat amount instead of the usual per-mile rate.
--
-- The lock trigger keeps a load's pay while its driver stays the same, so a
-- change to the driver's rate doesn't reprice their loads. set_load_driver_pay
-- is the one way to set it by hand: like apply_driver_rate_to_upcoming_loads,
-- it sets a flag for its own transaction that the trigger honours. Picking a
-- different driver still locks the new driver's usual rate.
--
-- A load on a paid statement keeps the pay it was paid at.

create or replace function public.loads_lock_driver_pay()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Set by hand through set_load_driver_pay, for a load whose driver stays.
  if tg_op = 'UPDATE'
     and new.driver_id is not distinct from old.driver_id
     and coalesce(current_setting('officetruck.set_driver_pay', true), '') = 'on' then
    return new;
  end if;

  -- Lock (or re-lock) when the driver is assigned or changed, when
  -- apply_driver_rate_to_upcoming_loads asks for it, and to fill in a rate
  -- that was missing because the driver had none when assigned.
  if tg_op = 'INSERT'
     or new.driver_id is distinct from old.driver_id
     or (old.driver_pay_type is null and new.driver_id is not null)
     or coalesce(current_setting('officetruck.relock_driver_pay', true), '') = 'on' then
    if new.driver_id is null then
      new.driver_pay_type := null;
      new.driver_pay_rate := null;
    else
      select d.pay_type, d.pay_rate
      into new.driver_pay_type, new.driver_pay_rate
      from public.drivers d
      where d.id = new.driver_id
        and d.organization_id = new.organization_id;
    end if;
  else
    -- Same driver: the locked rate stays as it was.
    new.driver_pay_type := old.driver_pay_type;
    new.driver_pay_rate := old.driver_pay_rate;
  end if;
  return new;
end;
$$;

-- Sets the driver's pay on one load. Errors carry a hint the app turns into
-- a message.
create function public.set_load_driver_pay(
  target_load uuid,
  new_type text,
  new_rate numeric
)
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
    raise exception 'That load doesn''t exist.'
      using errcode = 'P0002', hint = 'not_found';
  end if;

  if coalesce(public.organization_role(l.organization_id), '') not in ('owner', 'admin') then
    raise exception 'Only owners and admins can change driver pay.'
      using errcode = '42501', hint = 'not_allowed';
  end if;

  if l.driver_id is null then
    raise exception 'Assign a driver before setting their pay.'
      using errcode = '23514', hint = 'no_driver';
  end if;

  if exists (
    select 1 from public.driver_settlements s
    where s.status = 'paid'
      and s.organization_id = l.organization_id
      and l.id = any(s.load_ids)
  ) then
    raise exception 'This load is on a paid statement. Undo the payment to change its pay.'
      using errcode = '42501', hint = 'paid';
  end if;

  if new_type not in ('per_mile', 'percent', 'flat')
     or new_rate is null or new_rate < 0
     or (new_type = 'percent' and new_rate > 100) then
    raise exception 'Enter a valid pay rate.'
      using errcode = '23514', hint = 'invalid';
  end if;

  -- Only for this transaction, so nothing else skips the lock by accident.
  perform set_config('officetruck.set_driver_pay', 'on', true);
  update public.loads
  set driver_pay_type = new_type,
      driver_pay_rate = new_rate
  where id = target_load;
  perform set_config('officetruck.set_driver_pay', 'off', true);
end;
$$;

revoke execute on function public.set_load_driver_pay(uuid, text, numeric) from public, anon;
grant execute on function public.set_load_driver_pay(uuid, text, numeric) to authenticated;
