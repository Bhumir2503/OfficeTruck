-- Trailers get what trucks have: a maintenance log (the FMCSA asks a carrier
-- to keep one for every vehicle, trailers included) with receipts, and their
-- papers. Files go in the private truck-documents bucket under
-- "<organization>/<trailer>/", whose policies key on the organization folder.
-- Both go with the trailer when it's deleted.

create table public.trailer_maintenance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  trailer_id uuid not null,
  done_on date not null,
  kind text not null check (kind in (
    'preventive', 'repair', 'inspection', 'tires', 'other'
  )),
  description text not null check (char_length(trim(description)) between 1 and 500),
  odometer integer check (odometer between 0 and 5000000),
  cost numeric(10, 2) check (cost >= 0),
  vendor text check (char_length(trim(vendor)) between 1 and 120),
  receipt_path text check (char_length(receipt_path) <= 300),
  receipt_name text check (char_length(trim(receipt_name)) between 1 and 200),
  receipt_type text check (receipt_type in (
    'image/png', 'image/jpeg', 'image/webp', 'application/pdf'
  )),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint trailer_maintenance_trailer_fkey
    foreign key (organization_id, trailer_id)
    references public.trailers (organization_id, id) on delete cascade,
  constraint trailer_maintenance_receipt_complete check (
    (receipt_path is null) = (receipt_name is null)
    and (receipt_path is null) = (receipt_type is null)
  ),
  constraint trailer_maintenance_receipt_in_folder check (
    receipt_path is null
    or receipt_path like organization_id::text || '/' || trailer_id::text || '/%'
  )
);

create index trailer_maintenance_trailer_idx
  on public.trailer_maintenance (organization_id, trailer_id, done_on desc);

alter table public.trailer_maintenance enable row level security;

revoke all on public.trailer_maintenance from authenticated, anon;
grant select, insert, delete on public.trailer_maintenance to authenticated;

create policy "Members can view trailer maintenance"
  on public.trailer_maintenance for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Owners and admins can add trailer maintenance"
  on public.trailer_maintenance for insert
  to authenticated
  with check (
    (select public.organization_role(organization_id)) in ('owner', 'admin')
    and created_by = (select auth.uid())
  );

create policy "Owners and admins can remove trailer maintenance"
  on public.trailer_maintenance for delete
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));

create table public.trailer_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  trailer_id uuid not null,
  kind text not null check (kind in (
    'registration', 'insurance', 'annual_inspection', 'lease', 'title',
    'maintenance', 'other'
  )),
  title text check (char_length(title) <= 200),
  expires_on date,
  path text not null unique check (char_length(path) <= 300),
  file_name text not null check (char_length(trim(file_name)) between 1 and 200),
  content_type text not null check (content_type in (
    'image/png', 'image/jpeg', 'image/webp', 'application/pdf'
  )),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint trailer_documents_trailer_fkey
    foreign key (organization_id, trailer_id)
    references public.trailers (organization_id, id) on delete cascade,
  constraint trailer_documents_path_in_folder
    check (path like organization_id::text || '/' || trailer_id::text || '/%')
);

create index trailer_documents_trailer_idx
  on public.trailer_documents (organization_id, trailer_id, kind, created_at);

alter table public.trailer_documents enable row level security;

revoke all on public.trailer_documents from authenticated, anon;
grant select, insert, delete on public.trailer_documents to authenticated;

create policy "Members can view trailer documents"
  on public.trailer_documents for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Owners and admins can add trailer documents"
  on public.trailer_documents for insert
  to authenticated
  with check (
    (select public.organization_role(organization_id)) in ('owner', 'admin')
    and uploaded_by = (select auth.uid())
  );

create policy "Owners and admins can remove trailer documents"
  on public.trailer_documents for delete
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));
