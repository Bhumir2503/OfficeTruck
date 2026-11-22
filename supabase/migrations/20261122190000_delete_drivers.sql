-- Deleting a driver added by mistake. Loads and dispatches point at drivers
-- without a cascade, so the database refuses to delete one who has run
-- loads; those are marked inactive instead. Their documents, settlements and
-- checklist go with them (the DQ tables allow a delete that cascades from
-- the driver). The app also refuses a driver whose qualification file has
-- uploads or signatures, since those records must be kept.
grant delete on public.drivers to authenticated;

create policy "Owners and admins can delete drivers"
  on public.drivers for delete
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));

-- A truck whose default driver is deleted keeps running with no default,
-- rather than blocking the delete. Only the driver column is cleared; the
-- organization stays.
alter table public.trucks
  drop constraint trucks_default_driver_fkey,
  add constraint trucks_default_driver_fkey
    foreign key (organization_id, default_driver_id)
    references public.drivers (organization_id, id)
    on delete set null (default_driver_id);
