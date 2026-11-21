-- The 2290 is set aside until v2, which will rebuild it from scratch. This
-- removes its returns, the trucks each return listed, and the 2290 Schedule 1
-- document type on trucks. The returns' Schedule 1 files are deleted from
-- storage separately (Storage doesn't allow deleting files from SQL).

drop table if exists public.heavy_vehicle_tax_filing_trucks;
drop table if exists public.heavy_vehicle_tax_filings;
drop function if exists public.heavy_vehicle_tax_filings_before_update();

-- No truck document is a 2290 Schedule 1 any more, so stop allowing it.
alter table public.truck_documents
  drop constraint truck_documents_kind_check,
  add constraint truck_documents_kind_check check (kind in (
    'registration', 'insurance', 'annual_inspection', 'ifta', 'lease',
    'permit', 'title', 'maintenance', 'other'
  ));
