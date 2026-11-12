-- Let owners and admins change the organization URL, and owners delete it.

-- Covered by the existing "Owners and admins can update their organization"
-- policy; the format and uniqueness checks on slug still apply.
grant update (slug) on public.organizations to authenticated;

-- Deleting cascades to organization_users, removing everyone's access.
grant delete on public.organizations to authenticated;

create policy "Owners can delete their organization"
  on public.organizations for delete
  to authenticated
  using ((select public.organization_role(id)) = 'owner');
