-- Leaving an organization. Admins and members can leave on their own. The
-- owner can't, since every organization needs one: they transfer ownership
-- first, or delete the organization.

-- Errors carry a hint the app turns into a message: owner_cannot_leave,
-- not_a_member.
create function public.leave_organization(org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
begin
  -- Lock the membership, so an ownership transfer to the caller happening at
  -- the same time can't leave the organization without an owner.
  select role into caller_role
  from public.organization_users
  where organization_id = org_id
    and user_id = (select auth.uid())
  for update;

  if caller_role is null then
    raise exception 'You aren''t a member of this organization.'
      using errcode = 'P0001', hint = 'not_a_member';
  end if;

  if caller_role = 'owner' then
    raise exception 'The owner can''t leave. Transfer ownership first, or delete the organization.'
      using errcode = '42501', hint = 'owner_cannot_leave';
  end if;

  delete from public.organization_users
  where organization_id = org_id
    and user_id = (select auth.uid());
end;
$$;

revoke execute on function public.leave_organization(uuid) from public, anon;
grant execute on function public.leave_organization(uuid) to authenticated;
