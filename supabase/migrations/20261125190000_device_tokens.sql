-- Push notification tokens for the driver app. A phone registers its APNs
-- token after sign-in and again whenever iOS hands it a new one. A token
-- belongs to whoever registered it last: when someone else signs in on
-- the same phone, it moves to them. Signing out removes it.
--
-- Sending happens server side (service role), so nothing here lets a user
-- read anyone else's tokens.

create table public.device_tokens (
  token text primary key check (token ~ '^[0-9a-f]{32,200}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'ios' check (platform in ('ios')),
  -- Which APNs server the token works with: Xcode builds are sandbox,
  -- TestFlight and the App Store are production.
  environment text not null check (environment in ('sandbox', 'production')),
  app_version text check (char_length(app_version) <= 30),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index device_tokens_user_idx on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

-- Written only through the functions below; a user can list their own.
grant select on public.device_tokens to authenticated;

create policy "Users can see their own device tokens"
  on public.device_tokens for select
  to authenticated
  using (user_id = (select auth.uid()));

create function public.register_device(
  device_token text,
  apns_environment text,
  app_build text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'Sign in first.' using errcode = '42501', hint = 'signed_out';
  end if;
  insert into public.device_tokens (token, user_id, environment, app_version)
  values (lower(device_token), caller, apns_environment, app_build)
  on conflict (token) do update
    set user_id = excluded.user_id,
        environment = excluded.environment,
        app_version = excluded.app_version,
        last_seen_at = now();
end;
$$;

revoke execute on function public.register_device(text, text, text) from public, anon;
grant execute on function public.register_device(text, text, text) to authenticated;

create function public.unregister_device(device_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.device_tokens
  where token = lower(device_token) and user_id = (select auth.uid());
$$;

revoke execute on function public.unregister_device(text) from public, anon;
grant execute on function public.unregister_device(text) to authenticated;
