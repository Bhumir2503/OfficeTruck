-- Company profile fields, editable by an organization's owners and admins,
-- and member names visible to everyone in the same organization.

alter table public.organizations
  add column legal_name text check (char_length(legal_name) <= 200),
  add column dot_number text check (dot_number ~ '^[0-9]{1,8}$'),
  add column mc_number text check (mc_number ~ '^[0-9]{1,8}$'),
  add column phone text check (char_length(phone) <= 30),
  add column email text check (char_length(email) <= 254),
  add column address_line1 text check (char_length(address_line1) <= 200),
  add column address_line2 text check (char_length(address_line2) <= 200),
  add column city text check (char_length(city) <= 100),
  add column state text check (state in (
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI',
    'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN',
    'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
    'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
    'WV', 'WI', 'WY', 'AS', 'GU', 'MP', 'PR', 'VI'
  )),
  add column postal_code text check (postal_code ~ '^[0-9]{5}(-[0-9]{4})?$');

-- The caller's role in an organization, or null if they aren't a member.
-- Security definer for the same reason as is_organization_member().
create function public.organization_role(org_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.organization_users
  where organization_id = org_id
    and user_id = (select auth.uid());
$$;

revoke execute on function public.organization_role(uuid) from public, anon;
grant execute on function public.organization_role(uuid) to authenticated;

-- Only the profile fields can be edited. The slug stays fixed so links keep working.
grant update (
  name, legal_name, dot_number, mc_number, phone, email,
  address_line1, address_line2, city, state, postal_code
) on public.organizations to authenticated;

create policy "Owners and admins can update their organization"
  on public.organizations for update
  to authenticated
  using ((select public.organization_role(id)) in ('owner', 'admin'))
  with check ((select public.organization_role(id)) in ('owner', 'admin'));

-- True when the caller and the given user belong to at least one organization together.
create function public.shares_organization_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_users mine
    join public.organization_users theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = other_user
  );
$$;

revoke execute on function public.shares_organization_with(uuid) from public, anon;
grant execute on function public.shares_organization_with(uuid) to authenticated;

create policy "Members can view the profiles of people in their organizations"
  on public.profiles for select
  to authenticated
  using ((select public.shares_organization_with(id)));
