-- Load documents: the rate con, BOL, POD and lumper receipt, and anything
-- else worth keeping with a load. Whether the rate con, BOL and POD (and a
-- lumper receipt, when there's a lumper charge) are in decides whether the
-- load is ready to invoice.
--
-- Files live in the private load-documents bucket at
-- <organization id>/<load id>/<file>. A load can have several files of one
-- kind, e.g. a BOL photographed page by page.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'load-documents',
  'load-documents',
  false,
  20971520, -- 20 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do nothing;

-- driver_document_organization reads the organization from the first folder
-- of any path, so it serves this bucket too.
create policy "Members can see their organization's load documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'load-documents'
    and (select public.is_organization_member(public.driver_document_organization(name)))
  );

create policy "Members can upload load documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'load-documents'
    and (select public.is_organization_member(public.driver_document_organization(name)))
  );

create policy "Members can remove load documents"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'load-documents'
    and (select public.is_organization_member(public.driver_document_organization(name)))
  );

create table public.load_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  load_id uuid not null,
  kind text not null check (kind in ('rate_con', 'bol', 'pod', 'lumper_receipt', 'other')),
  -- Where the file is in the load-documents bucket. It must sit in this
  -- load's folder.
  path text not null unique check (char_length(path) <= 300),
  file_name text not null check (char_length(trim(file_name)) between 1 and 200),
  content_type text not null check (content_type in (
    'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf'
  )),
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint load_documents_path_in_folder
    check (path like organization_id::text || '/' || load_id::text || '/%'),
  foreign key (organization_id, load_id)
    references public.loads (organization_id, id) on delete cascade
);

create index load_documents_load_idx on public.load_documents (load_id, kind, created_at);

alter table public.load_documents enable row level security;

-- No update: a document is replaced by uploading another and removing the
-- old one.
grant select, insert, delete on public.load_documents to authenticated;

create policy "Members can view their organization's load documents"
  on public.load_documents for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Members can add load documents"
  on public.load_documents for insert
  to authenticated
  with check (
    (select public.is_organization_member(organization_id))
    and uploaded_by = (select auth.uid())
  );

create policy "Members can remove load documents"
  on public.load_documents for delete
  to authenticated
  using ((select public.is_organization_member(organization_id)));
