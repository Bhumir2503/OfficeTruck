-- Organizations and the users who belong to them.
-- Users only ever see organizations they are a member of. New organizations
-- are made through create_organization(), which also adds the creator as owner.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  -- Used in URLs: /org/<slug>
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 40),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.organization_users (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- The primary key covers lookups by organization; this covers "my organizations".
create index organization_users_user_id_idx on public.organization_users (user_id);

alter table public.organizations enable row level security;
alter table public.organization_users enable row level security;

grant select on public.organizations to authenticated;
grant select on public.organization_users to authenticated;

-- Security definer so policies on organization_users can call it without
-- re-running those same policies (which would recurse).
create function public.is_organization_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_users
    where organization_id = org_id
      and user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_organization_member(uuid) from public, anon;
grant execute on function public.is_organization_member(uuid) to authenticated;

create policy "Members can view their organizations"
  on public.organizations for select
  to authenticated
  using ((select public.is_organization_member(id)));

create policy "Members can view the members of their organizations"
  on public.organization_users for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

-- Creates an organization and makes the caller its owner, in one transaction.
-- Raises unique_violation (23505) if the slug is already taken.
create function public.create_organization(org_name text, org_slug text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org public.organizations;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (trim(org_name), lower(trim(org_slug)), (select auth.uid()))
  returning * into new_org;

  insert into public.organization_users (organization_id, user_id, role)
  values (new_org.id, (select auth.uid()), 'owner');

  return new_org;
end;
$$;

revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
