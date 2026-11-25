-- Lets a driver change their own phone number from the driver app.
--
-- The app first changes the number on the driver's login: Supabase texts a
-- code to the new number, and the change only takes once it's entered. Then
-- update_my_phone() copies that verified number to the driver's records
-- (drivers.phone), so the office sees it and login_phone follows it
-- (drivers_derive_login_phone). The number comes from auth.users, never
-- from the app, so a driver can only set a number they've proven they hold.
--
-- Changing a driver's phone normally signs the old login out
-- (drivers_guard_login). Here the login already holds the new number, so
-- update_my_phone() tells the guard to keep it linked, for this update only.

create or replace function public.drivers_guard_login()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' then
      new.user_id := null;
    end if;
    return new;
  end if;

  if new.login_phone is distinct from old.login_phone then
    -- Set only inside update_my_phone(), which the app can't reach around.
    if coalesce(current_setting('officetruck.keep_login', true), '') <> 'on' then
      new.user_id := null;
    end if;
  elsif current_user = 'authenticated'
    and new.user_id is not null
    and new.user_id is distinct from old.user_id then
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

-- Copies the signed-in driver's verified phone number to every active
-- driver record they're signed in as. Returns how many changed.
create function public.update_my_phone()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  verified text;
  digits text;
  changed integer;
begin
  if caller is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select u.phone into verified
  from auth.users u
  where u.id = caller
    and u.phone_confirmed_at is not null;

  -- Stored without the +: 15550101234. US numbers only, like sign-in.
  digits := regexp_replace(coalesce(verified, ''), '\D', '', 'g');
  if length(digits) = 11 and digits like '1%' then
    digits := substr(digits, 2);
  end if;
  if length(digits) <> 10 then
    raise exception 'Only US phone numbers can sign in' using errcode = '22023';
  end if;

  perform set_config('officetruck.keep_login', 'on', true);
  begin
    update public.drivers d
    -- As the office app writes it: (555) 010-1234.
    set phone = '(' || substr(digits, 1, 3) || ') ' || substr(digits, 4, 3) || '-' || substr(digits, 7)
    where d.user_id = caller
      and (d.end_date is null or d.end_date >= current_date)
      and d.login_phone is distinct from '+1' || digits;
    get diagnostics changed = row_count;
  exception when unique_violation then
    perform set_config('officetruck.keep_login', '', true);
    raise exception 'Another driver at your company already has that number. Ask dispatch to fix it.'
      using errcode = '23505';
  end;
  perform set_config('officetruck.keep_login', '', true);

  return changed;
end;
$$;

revoke execute on function public.update_my_phone() from public, anon;
grant execute on function public.update_my_phone() to authenticated;
