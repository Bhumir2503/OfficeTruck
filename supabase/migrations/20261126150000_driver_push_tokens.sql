-- Push notifications for the driver app: each phone a driver signs in on
-- registers its Apple push token, and the office app sends a push to the
-- driver's phones when it dispatches a load to them.
--
-- Tokens are kept per signed-in user (not per driver record), since one
-- person may drive for more than one carrier. Only the functions below touch
-- the table; nobody reads it directly.

create table public.driver_push_tokens (
  token text primary key check (token ~ '^[0-9a-f]{64,200}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 'sandbox' for development builds, 'production' for TestFlight and the
  -- App Store: Apple has a separate push server for each.
  environment text not null check (environment in ('sandbox', 'production')),
  updated_at timestamptz not null default now()
);

create index driver_push_tokens_user_id_idx on public.driver_push_tokens (user_id);

alter table public.driver_push_tokens enable row level security;
revoke all on public.driver_push_tokens from public, anon, authenticated;

-- The driver app saves this phone's token after sign-in (again whenever iOS
-- hands it a new one). A token that moved to another user (a shared phone)
-- now belongs to whoever signed in last.
create function public.register_my_push_token(push_token text, push_environment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  insert into public.driver_push_tokens (token, user_id, environment, updated_at)
  values (lower(push_token), (select auth.uid()), push_environment, now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        environment = excluded.environment,
        updated_at = now();
end;
$$;

revoke execute on function public.register_my_push_token(text, text) from public, anon;
grant execute on function public.register_my_push_token(text, text) to authenticated;

-- Signing out of the driver app stops pushes to that phone.
create function public.remove_my_push_token(push_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.driver_push_tokens
  where token = lower(push_token) and user_id = (select auth.uid());
$$;

revoke execute on function public.remove_my_push_token(text) from public, anon;
grant execute on function public.remove_my_push_token(text) to authenticated;

-- For the office app, right after it dispatches a load: the push tokens of
-- the load's driver, with what the push says about the load. Members of the
-- load's organization only, and only while the load is dispatched or on the
-- road. Nothing about the rate.
create function public.load_push_targets(target_load uuid)
returns table (
  token text,
  environment text,
  reference text,
  pickup_location text,
  pickup_start timestamp,
  delivery_location text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.token, t.environment, l.reference, l.pickup_location, l.pickup_start, l.delivery_location
  from public.loads l
  join public.drivers d on d.id = l.driver_id and d.organization_id = l.organization_id
  join public.driver_push_tokens t on t.user_id = d.user_id
  where l.id = target_load
    and l.status in ('dispatched', 'loaded')
    and public.is_organization_member(l.organization_id);
$$;

revoke execute on function public.load_push_targets(uuid) from public, anon;
grant execute on function public.load_push_targets(uuid) to authenticated;
