-- Removing people from an organization.
--   * The owner can remove admins and members.
--   * Admins can remove members.
-- Nobody can remove the owner or themselves through this.

-- Errors carry a hint the app turns into a message: not_allowed,
-- cannot_remove_self, cannot_remove_owner, not_a_member.
create function public.remove_member(org_id uuid, member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  target_role text;
begin
  -- Lock the caller's membership, so a role change or ownership transfer
  -- happening at the same time can't slip in between the check and the delete.
  select role into caller_role
  from public.organization_users
  where organization_id = org_id
    and user_id = (select auth.uid())
  for update;

  if coalesce(caller_role, '') not in ('owner', 'admin') then
    raise exception 'Only owners and admins can remove people.'
      using errcode = '42501', hint = 'not_allowed';
  end if;

  if member_id = (select auth.uid()) then
    raise exception 'You can''t remove yourself.'
      using errcode = '42501', hint = 'cannot_remove_self';
  end if;

  select role into target_role
  from public.organization_users
  where organization_id = org_id
    and user_id = member_id
  for update;

  if target_role is null then
    raise exception 'That person isn''t a member of this organization.'
      using errcode = 'P0001', hint = 'not_a_member';
  end if;

  if target_role = 'owner' then
    raise exception 'The owner can''t be removed.'
      using errcode = '42501', hint = 'cannot_remove_owner';
  end if;

  if caller_role = 'admin' and target_role <> 'member' then
    raise exception 'Admins can only remove members.'
      using errcode = '42501', hint = 'not_allowed';
  end if;

  delete from public.organization_users
  where organization_id = org_id
    and user_id = member_id;
end;
$$;

revoke execute on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
