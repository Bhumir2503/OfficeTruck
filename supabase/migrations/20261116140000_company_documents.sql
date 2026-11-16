-- The company's own papers: operating authority, insurance certificate,
-- W-9, BOC-3, IFTA license and the like, with the date each runs out. The
-- files go in the load-documents bucket under "<organization>/company/",
-- which its policies already limit to the organization's members.

create table public.company_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in (
    'authority', 'insurance', 'w9', 'boc3', 'ucr', 'irp', 'ifta_license',
    'permit', 'other'
  )),
  -- What it is, when "other" or to tell two apart.
  title text check (char_length(title) <= 200),
  expires_on date,
  path text not null unique check (char_length(path) <= 300),
  file_name text not null check (char_length(trim(file_name)) between 1 and 200),
  content_type text not null check (content_type in (
    'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf'
  )),
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint company_documents_path_in_folder
    check (path like organization_id::text || '/company/%')
);

create index company_documents_organization_idx
  on public.company_documents (organization_id, kind, created_at);

alter table public.company_documents enable row level security;

grant select, insert, delete on public.company_documents to authenticated;

create policy "Members can view company documents"
  on public.company_documents for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Members can add company documents"
  on public.company_documents for insert
  to authenticated
  with check (
    (select public.is_organization_member(organization_id))
    and uploaded_by = (select auth.uid())
  );

create policy "Members can remove company documents"
  on public.company_documents for delete
  to authenticated
  using ((select public.is_organization_member(organization_id)));
