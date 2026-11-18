-- Renaming a driver's document (the CDL copy on the CDL card, say). Only
-- the file name can change: the column grant leaves everything else as it
-- was uploaded. Owners and admins only, like adding and removing them.

grant update (file_name) on public.driver_documents to authenticated;

create policy "Owners and admins can rename driver documents"
  on public.driver_documents for update
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'))
  with check ((select public.organization_role(organization_id)) in ('owner', 'admin'));
