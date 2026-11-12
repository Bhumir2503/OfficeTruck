-- Drivers, part 2: pay rate, the yearly compliance dates, photos of the CDL
-- and medical card, and loads tied to the driver who ran them.

-- Pay rate. Only feeds the profit math for now; settlements come later.
--   per_mile: dollars per mile, e.g. 0.650
--   percent:  percent of the load's rate, e.g. 25.000
--   flat:     dollars per load, e.g. 500.000
-- Either both are set or neither is.
alter table public.drivers
  add column pay_type text check (pay_type in ('per_mile', 'percent', 'flat')),
  add column pay_rate numeric(10, 3) check (pay_rate >= 0),
  add constraint drivers_pay_rate_set check ((pay_type is null) = (pay_rate is null)),
  add constraint drivers_pay_percent_max check (pay_type <> 'percent' or pay_rate <= 100);

-- The yearly checks, stored as when they were last done; each is due again a
-- year later. Annual review of the driving record (49 CFR 391.25) and the
-- annual limited Clearinghouse query (49 CFR 382.701).
alter table public.drivers
  add column annual_review_on date,
  add column clearinghouse_query_on date;

-- Photos of the CDL and medical card: paths in the driver-documents bucket.
alter table public.drivers
  add column cdl_photo_path text check (char_length(cdl_photo_path) <= 300),
  add column medical_card_photo_path text check (char_length(medical_card_photo_path) <= 300);

-- Private, since these are ID documents. Files live at
-- driver-documents/<organization id>/<driver id>/<file>. Members of the
-- organization can see them (through short-lived signed URLs); owners and
-- admins can add, replace and remove them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-documents',
  'driver-documents',
  false,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- The organization a driver-documents path belongs to, or null if the first
-- folder isn't a UUID (so a malformed path is refused instead of erroring).
create function public.driver_document_organization(path text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when (storage.foldername(path))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(path))[1])::uuid
  end;
$$;

revoke execute on function public.driver_document_organization(text) from public, anon;
grant execute on function public.driver_document_organization(text) to authenticated;

create policy "Members can see their organization's driver documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'driver-documents'
    and (select public.is_organization_member(public.driver_document_organization(name)))
  );

create policy "Owners and admins can upload driver documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'driver-documents'
    and (select public.organization_role(public.driver_document_organization(name))) in ('owner', 'admin')
  );

create policy "Owners and admins can replace driver documents"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'driver-documents'
    and (select public.organization_role(public.driver_document_organization(name))) in ('owner', 'admin')
  )
  with check (
    bucket_id = 'driver-documents'
    and (select public.organization_role(public.driver_document_organization(name))) in ('owner', 'admin')
  );

create policy "Owners and admins can remove driver documents"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'driver-documents'
    and (select public.organization_role(public.driver_document_organization(name))) in ('owner', 'admin')
  );

-- Loads: who drove it, and how far. The driver must be in the same
-- organization as the load, which the two-column foreign key enforces.
alter table public.drivers
  add constraint drivers_organization_id_id_key unique (organization_id, id);

alter table public.loads
  add column driver_id uuid,
  add column miles integer check (miles between 0 and 100000),
  add constraint loads_driver_fkey
    foreign key (organization_id, driver_id)
    references public.drivers (organization_id, id);

-- A driver's load history, newest pickup first.
create index loads_driver_pickup_idx
  on public.loads (driver_id, pickup_start desc)
  where driver_id is not null;

-- Link loads typed in before drivers existed, where the name matches exactly
-- one driver in the organization.
update public.loads l
set driver_id = d.id
from public.drivers d
where l.driver_id is null
  and l.driver_name is not null
  and d.organization_id = l.organization_id
  and lower(trim(d.full_name)) = lower(trim(l.driver_name))
  and (
    select count(*)
    from public.drivers same
    where same.organization_id = l.organization_id
      and lower(trim(same.full_name)) = lower(trim(l.driver_name))
  ) = 1;
