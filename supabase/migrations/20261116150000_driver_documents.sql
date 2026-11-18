-- A driver's papers, any number of them: CDL, medical card, driving record,
-- drug test results, application and the like. Replaces the two fixed photo
-- columns on drivers; their files are copied in here and the columns are
-- left alone for now, so nothing is lost. Files stay in the driver-documents
-- bucket under "<organization>/<driver>/", whose policies already let members
-- read them and owners and admins add and remove them.

create table public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  driver_id uuid not null,
  kind text not null check (kind in (
    'cdl', 'medical_card', 'mvr', 'drug_test', 'application', 'road_test',
    'clearinghouse', 'w9', 'other'
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
  constraint driver_documents_driver_fkey
    foreign key (organization_id, driver_id)
    references public.drivers (organization_id, id) on delete cascade,
  constraint driver_documents_path_in_folder
    check (path like organization_id::text || '/' || driver_id::text || '/%')
);

create index driver_documents_driver_idx
  on public.driver_documents (organization_id, driver_id, kind, created_at);

alter table public.driver_documents enable row level security;

grant select, insert, delete on public.driver_documents to authenticated;

create policy "Members can view driver documents"
  on public.driver_documents for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Owners and admins can add driver documents"
  on public.driver_documents for insert
  to authenticated
  with check (
    (select public.organization_role(organization_id)) in ('owner', 'admin')
    and uploaded_by = (select auth.uid())
  );

create policy "Owners and admins can remove driver documents"
  on public.driver_documents for delete
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));

-- Bring over the CDL and medical card photos already uploaded.
insert into public.driver_documents (
  organization_id, driver_id, kind, path, file_name, content_type,
  size_bytes, uploaded_by, created_at
)
select
  d.organization_id,
  d.id,
  photo.kind,
  photo.path,
  photo.label || case when photo.path like '%.pdf' then '.pdf' else '.webp' end,
  case when photo.path like '%.pdf' then 'application/pdf' else 'image/webp' end,
  greatest(1, least(10485760, coalesce((o.metadata ->> 'size')::integer, 1))),
  null,
  coalesce(o.created_at, d.updated_at)
from public.drivers d
cross join lateral (
  values
    ('cdl', 'CDL', d.cdl_photo_path),
    ('medical_card', 'Medical card', d.medical_card_photo_path)
) as photo (kind, label, path)
left join storage.objects o
  on o.bucket_id = 'driver-documents' and o.name = photo.path
where photo.path is not null
  and photo.path like d.organization_id::text || '/' || d.id::text || '/%'
on conflict (path) do nothing;
