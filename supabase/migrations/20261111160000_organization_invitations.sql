-- Invitations to join an organization. An owner or admin invites an email
-- address; the person gets a link with a secret token, and joins by opening
-- it while signed in with that address. Invitations last 7 days. Expired ones
-- can't be accepted, and a scheduled job deletes them.
create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (
    email = lower(btrim(email))
    and email like '%_@_%'
    and length(email) <= 320
  ),
  role text not null check (role in ('admin', 'member')),
  -- SHA-256 of the token in the emailed link. The token itself is never stored,
  -- so reading this table doesn't give anyone a working link.
  token_hash bytea not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- Inviting the same address again replaces the old invitation.
  unique (organization_id, email)
);

create index organization_invitations_expires_at_idx
  on public.organization_invitations (expires_at);

alter table public.organization_invitations enable row level security;

-- Invitations are created through invite_to_organization() below, never directly.
grant select, delete on public.organization_invitations to authenticated;

create policy "Owners and admins can see their organization's invitations"
  on public.organization_invitations for select
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));

create policy "Owners and admins can revoke invitations"
  on public.organization_invitations for delete
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));

-- Invites (or re-invites) an email address and returns the secret token for
-- the emailed link. This is the only time the token is ever available.
-- Errors carry a hint the app turns into a message: not_allowed,
-- already_member.
create function public.invite_to_organization(
  org_id uuid,
  invite_email text,
  invite_role text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_email text := lower(btrim(invite_email));
  -- Two random UUIDs: 244 random bits, from a secure random source.
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if coalesce(public.organization_role(org_id), '') not in ('owner', 'admin') then
    raise exception 'Only owners and admins can invite people.'
      using errcode = '42501', hint = 'not_allowed';
  end if;

  if exists (
    select 1
    from public.organization_users ou
    join auth.users u on u.id = ou.user_id
    where ou.organization_id = org_id
      and lower(u.email) = clean_email
  ) then
    raise exception 'That person is already a member of this organization.'
      using errcode = 'P0001', hint = 'already_member';
  end if;

  insert into public.organization_invitations
    (organization_id, email, role, token_hash, invited_by, expires_at)
  values (
    org_id,
    clean_email,
    invite_role,
    sha256(convert_to(token, 'UTF8')),
    auth.uid(),
    now() + interval '7 days'
  )
  on conflict (organization_id, email) do update
    set role = excluded.role,
        token_hash = excluded.token_hash,
        invited_by = excluded.invited_by,
        created_at = now(),
        expires_at = excluded.expires_at;

  return token;
end;
$$;

revoke execute on function public.invite_to_organization(uuid, text, text) from public, anon;
grant execute on function public.invite_to_organization(uuid, text, text) to authenticated;

-- What the invitation page shows. Works signed out too, since the person may
-- not have an account yet; knowing the token is what grants access.
-- Returns no row for an unknown or expired token.
create function public.get_invitation(invite_token text)
returns table (
  organization_name text,
  email text,
  role text,
  invited_by_name text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, i.email, i.role, p.full_name, i.expires_at
  from public.organization_invitations i
  join public.organizations o on o.id = i.organization_id
  left join public.profiles p on p.id = i.invited_by
  where i.token_hash = sha256(convert_to(invite_token, 'UTF8'))
    and i.expires_at > now();
$$;

revoke execute on function public.get_invitation(text) from public;
grant execute on function public.get_invitation(text) to anon, authenticated;

-- Joins the organization and uses up the invitation. Returns the
-- organization's slug. The caller must be signed in with the invited, confirmed
-- email address, so a forwarded link can't be used by someone else.
-- Error hints: invitation_invalid, email_mismatch, email_unconfirmed.
create function public.accept_invitation(invite_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.organization_invitations;
  caller auth.users;
  org_slug text;
begin
  select * into caller from auth.users where id = auth.uid();
  if caller.id is null then
    raise exception 'Sign in to accept this invitation.'
      using errcode = '42501', hint = 'not_signed_in';
  end if;

  select * into invitation
  from public.organization_invitations
  where token_hash = sha256(convert_to(invite_token, 'UTF8'))
    and expires_at > now()
  for update;

  if invitation.id is null then
    raise exception 'This invitation is invalid or has expired.'
      using errcode = 'P0001', hint = 'invitation_invalid';
  end if;

  if lower(caller.email) is distinct from invitation.email then
    raise exception 'This invitation was sent to a different email address.'
      using errcode = '42501', hint = 'email_mismatch';
  end if;

  if caller.email_confirmed_at is null then
    raise exception 'Confirm your email address before accepting.'
      using errcode = '42501', hint = 'email_unconfirmed';
  end if;

  -- Already a member (e.g. invited twice): keep their current role.
  insert into public.organization_users (organization_id, user_id, role)
  values (invitation.organization_id, caller.id, invitation.role)
  on conflict do nothing;

  delete from public.organization_invitations where id = invitation.id;

  select slug into org_slug from public.organizations where id = invitation.organization_id;
  return org_slug;
end;
$$;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- Turns an invitation down, deleting it. Anyone with the link can do this.
create function public.decline_invitation(invite_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.organization_invitations
  where token_hash = sha256(convert_to(invite_token, 'UTF8'));
$$;

revoke execute on function public.decline_invitation(text) from public;
grant execute on function public.decline_invitation(text) to anon, authenticated;

-- Delete expired invitations every hour. (They already stop working the
-- moment they expire; this just clears them out.)
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'delete-expired-organization-invitations',
  '0 * * * *',
  $$ delete from public.organization_invitations where expires_at <= now() $$
);
