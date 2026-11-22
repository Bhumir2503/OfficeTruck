-- A receipt or invoice on a maintenance entry: the shop's bill for the work.
-- The file sits in the truck's folder in the private truck-documents bucket,
-- whose policies already let members read and owners and admins add and
-- remove files there.

alter table public.truck_maintenance
  add column receipt_path text check (char_length(receipt_path) <= 300),
  add column receipt_name text
    check (char_length(trim(receipt_name)) between 1 and 200),
  add column receipt_type text check (receipt_type in (
    'image/png', 'image/jpeg', 'image/webp', 'application/pdf'
  )),
  -- All three or none, and only in this truck's own folder.
  add constraint truck_maintenance_receipt_complete check (
    (receipt_path is null) = (receipt_name is null)
    and (receipt_path is null) = (receipt_type is null)
  ),
  add constraint truck_maintenance_receipt_in_folder check (
    receipt_path is null
    or receipt_path like organization_id::text || '/' || truck_id::text || '/%'
  );
