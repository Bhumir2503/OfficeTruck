-- "Apply new rate to upcoming loads": after a driver's rate changes, owners
-- and admins can move the driver's booked loads (not yet driven) onto it.
-- Loads in transit, delivered or invoiced keep the rate they were locked at.

-- The lock trigger keeps a load's rate while its driver stays the same. This
-- function is the one way past that: it sets a flag for its own transaction
-- that the trigger honours.
create or replace function public.loads_lock_driver_pay()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
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

-- Re-locks a driver's booked loads at their current rate. Returns how many
-- loads changed. Errors carry a hint the app turns into a message.
create function public.apply_driver_rate_to_upcoming_loads(target_driver uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  changed integer;
begin
  select organization_id into org
  from public.drivers
  where id = target_driver;

  if org is null then
    raise exception 'That driver doesn''t exist.'
      using errcode = 'P0002', hint = 'not_found';
  end if;

  if coalesce(public.organization_role(org), '') not in ('owner', 'admin') then
    raise exception 'Only owners and admins can change driver pay.'
      using errcode = '42501', hint = 'not_allowed';
  end if;

  -- Only for this transaction, so nothing else re-locks by accident.
  perform set_config('officetruck.relock_driver_pay', 'on', true);

  update public.loads l
  set driver_pay_type = d.pay_type
  from public.drivers d
  where d.id = target_driver
    and l.driver_id = target_driver
    and l.organization_id = org
    and l.status = 'booked'
    and (l.driver_pay_type, l.driver_pay_rate)
        is distinct from (d.pay_type, d.pay_rate);
  get diagnostics changed = row_count;

  perform set_config('officetruck.relock_driver_pay', 'off', true);
  return changed;
end;
$$;

revoke execute on function public.apply_driver_rate_to_upcoming_loads(uuid) from public, anon;
grant execute on function public.apply_driver_rate_to_upcoming_loads(uuid) to authenticated;
