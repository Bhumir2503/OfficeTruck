-- Changing roles. Only the owner can change roles:
--   * set_member_role() moves someone between admin and member.
--   * transfer_ownership() makes someone else the owner; the old owner
--     becomes an admin.
-- Each organization has exactly one owner, enforced below.

create unique index organization_users_one_owner_idx
  on public.organization_users (organization_id)
  where role = 'owner';

-- Errors carry a hint the app turns into a message: not_owner, invalid_role,
-- cannot_change_self, not_a_member.
create function public.set_member_role(
  org_id uuid,
  member_id uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.organization_role(org_id) is distinct from 'owner' then
    raise exception 'Only the owner can change roles.'
      using errcode = '42501', hint = 'not_owner';
  end if;

  if new_role is null or new_role not in ('admin', 'member') then
    raise exception 'Choose admin or member. To hand over the organization, transfer ownership.'
      using errcode = '22023', hint = 'invalid_role';
  end if;

  if member_id = (select auth.uid()) then
    raise exception 'You can''t change your own role.'
      using errcode = '42501', hint = 'cannot_change_self';
  end if;

  update public.organization_users
  set role = new_role
  where organization_id = org_id
    and user_id = member_id
    and role <> 'owner';

  if not found then
    raise exception 'That person isn''t a member of this organization.'
      using errcode = 'P0001', hint = 'not_a_member';
  end if;
end;
$$;

revoke execute on function public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;

create function public.transfer_ownership(org_id uuid, new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
begin
  -- Lock the caller's membership first, so two transfers at once can't both
  -- go through: the second waits, then sees the caller is no longer owner.
  select role into caller_role
  from public.organization_users
  where organization_id = org_id
    and user_id = (select auth.uid())
  for update;

  if caller_role is distinct from 'owner' then
    raise exception 'Only the owner can transfer ownership.'
      using errcode = '42501', hint = 'not_owner';
  end if;

  if new_owner_id = (select auth.uid()) then
    raise exception 'You''re already the owner.'
      using errcode = '42501', hint = 'cannot_change_self';
  end if;

  perform 1
  from public.organization_users
  where organization_id = org_id
    and user_id = new_owner_id
  for update;

  if not found then
    raise exception 'That person isn''t a member of this organization.'
      using errcode = 'P0001', hint = 'not_a_member';
  end if;

  -- In this order, so there's never a moment with two owners.
  update public.organization_users
  set role = 'admin'
  where organization_id = org_id
    and user_id = (select auth.uid());

  update public.organization_users
  set role = 'owner'
  where organization_id = org_id
    and user_id = new_owner_id;
end;
$$;

revoke execute on function public.transfer_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
