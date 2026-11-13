-- Lock the driver's pay rate onto each load. Pay used to be worked out from
-- the driver's current rate, so a raise quietly repriced every past load.
-- Now the rate is copied onto the load when a driver is assigned, and
-- changing a driver's rate only affects loads they're assigned to after.
--
-- For per-mile pay the rate is locked but the miles can still be corrected:
-- pay is the locked rate × the load's miles. Settlements will lock the final
-- amount when they're built.

alter table public.loads
  add column driver_pay_type text check (driver_pay_type in ('per_mile', 'percent', 'flat')),
  add column driver_pay_rate numeric(10, 3) check (driver_pay_rate >= 0),
  add constraint loads_driver_pay_set
    check ((driver_pay_type is null) = (driver_pay_rate is null)),
  add constraint loads_driver_pay_percent_max
    check (driver_pay_type <> 'percent' or driver_pay_rate <= 100);

-- Copies the driver's rate onto the load when a driver is assigned or
-- changed, and clears it when the driver is removed. Done in the database so
-- every way of assigning a driver gets it, and it can't be set by hand to
-- something else in the same statement.
create function public.loads_lock_driver_pay()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Lock (or re-lock) when the driver is assigned or changed, and fill in a
  -- rate that was missing because the driver had none when assigned.
  if tg_op = 'INSERT'
     or new.driver_id is distinct from old.driver_id
     or (old.driver_pay_type is null and new.driver_id is not null) then
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

create trigger loads_lock_driver_pay
  before insert or update on public.loads
  for each row execute function public.loads_lock_driver_pay();

-- Loads booked before this: lock in each driver's rate as it is today. The
-- trigger above keeps a load's rate on any update that doesn't change the
-- driver, so this runs with it switched off.
alter table public.loads disable trigger loads_lock_driver_pay;

update public.loads l
set driver_pay_type = d.pay_type,
    driver_pay_rate = d.pay_rate
from public.drivers d
where d.id = l.driver_id;

alter table public.loads enable trigger loads_lock_driver_pay;
