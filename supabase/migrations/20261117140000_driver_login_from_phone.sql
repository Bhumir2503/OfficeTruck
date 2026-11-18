-- Drivers sign in with the phone number on their profile (drivers.phone),
-- not a separate sign-in number. login_phone is now kept in step with it by
-- the trigger below, as +15551234567, so claim_driver_logins() and the
-- one-number-per-driver rule work as before. Changing a driver's phone
-- still signs the old number out (drivers_guard_login, which runs after
-- this trigger since triggers run in name order).
--
-- A phone that isn't a 10-digit US number (or 11 digits starting with 1)
-- gives no sign-in number, so that driver can't sign in until it's fixed.

create function public.driver_login_phone(phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) = 10
      then '+1' || regexp_replace(phone, '\D', '', 'g')
    when length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) = 11
      and regexp_replace(phone, '\D', '', 'g') like '1%'
      then '+' || regexp_replace(phone, '\D', '', 'g')
  end;
$$;

create function public.drivers_derive_login_phone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.login_phone := public.driver_login_phone(new.phone);
  return new;
end;
$$;

create trigger drivers_derive_login_phone
  before insert or update on public.drivers
  for each row execute function public.drivers_derive_login_phone();

-- Existing drivers: their sign-in number becomes their profile phone.
update public.drivers
set login_phone = public.driver_login_phone(phone)
where login_phone is distinct from public.driver_login_phone(phone);
