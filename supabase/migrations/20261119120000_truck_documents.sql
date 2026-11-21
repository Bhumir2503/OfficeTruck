-- A truck's papers: registration or IRP cab card, insurance card, annual
-- inspection report, 2290 Schedule 1, IFTA license, lease, permits and the
-- like. Built like driver_documents. Files live in a private
-- truck-documents bucket under "<organization>/<truck>/"; members can read
-- them, owners and admins can add and remove them.

create table public.truck_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  truck_id uuid not null,
  kind text not null check (kind in (
    'registration', 'insurance', 'annual_inspection', 'form_2290', 'ifta',
    'lease', 'permit', 'title', 'maintenance', 'other'
  )),
  -- What it is, when "other" or to tell two apart.
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
  constraint truck_documents_truck_fkey
    foreign key (organization_id, truck_id)
    references public.trucks (organization_id, id) on delete cascade,
  constraint truck_documents_path_in_folder
    check (path like organization_id::text || '/' || truck_id::text || '/%')
);

create index truck_documents_truck_idx
  on public.truck_documents (organization_id, truck_id, kind, created_at);

alter table public.truck_documents enable row level security;

-- Documents are added and removed, never edited. Supabase grants every
-- signed-in user everything on new tables by default, so take that away
-- first and grant only what's used.
revoke all on public.truck_documents from authenticated, anon;
grant select, insert, delete on public.truck_documents to authenticated;

create policy "Members can view truck documents"
  on public.truck_documents for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Owners and admins can add truck documents"
  on public.truck_documents for insert
  to authenticated
  with check (
    (select public.organization_role(organization_id)) in ('owner', 'admin')
    and uploaded_by = (select auth.uid())
  );

create policy "Owners and admins can remove truck documents"
  on public.truck_documents for delete
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));

-- Private, like driver documents. Members see files through short-lived
-- signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'truck-documents',
  'truck-documents',
  false,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- driver_document_organization() reads the organization from the first
-- folder of any path, so it serves this bucket too.

create policy "Members can see their organization's truck documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'truck-documents'
    and (select public.is_organization_member(public.driver_document_organization(name)))
  );

create policy "Owners and admins can upload truck documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'truck-documents'
    and (select public.organization_role(public.driver_document_organization(name))) in ('owner', 'admin')
  );

create policy "Owners and admins can remove truck documents"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'truck-documents'
    and (select public.organization_role(public.driver_document_organization(name))) in ('owner', 'admin')
  );
