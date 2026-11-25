-- Drivers send their own paperwork from the driver app.
--
--   * A new CDL or medical card: the driver uploads a copy and the
--     expiration date printed on it. It waits in driver_updates until an
--     owner or admin accepts it (the copy joins the driver's documents and
--     the date goes on the driver) or declines it with a note. Nothing on
--     the driver changes until then.
--   * The DQ file: my_dq_file() lists the driver's current checklist, and
--     add_my_dq_document() adds an upload to one item. Uploads stay
--     unconfirmed until the office confirms them, as with the web.
--
-- Files: driver-documents/<organization>/<driver>/from-driver/<file> for
-- CDL and medical card copies; dq-files/<organization>/<driver>/dq/<file>
-- for DQ uploads (already allowed for the driver by dq_path_allowed).

-- ---------------------------------------------- CDL and medical card -----

create table public.driver_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  driver_id uuid not null,
  kind text not null check (kind in ('cdl', 'medical_card')),
  -- As the driver read it off the card. The office can correct it when
  -- accepting.
  expires_on date not null check (expires_on > '2000-01-01'),
  path text not null unique check (char_length(path) <= 300),
  file_name text not null check (char_length(trim(file_name)) between 1 and 200),
  content_type text not null check (content_type in (
    'image/png', 'image/jpeg', 'image/webp', 'application/pdf'
  )),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  --   pending   waiting for the office
  --   accepted  copied to driver_documents, date set on the driver
  --   declined  not used; review_note says why
  --   replaced  the driver sent a newer one before this was reviewed
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'replaced')),
  review_note text check (char_length(trim(review_note)) between 1 and 500),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  driver_document_id uuid references public.driver_documents (id) on delete set null,
  submitted_by uuid references auth.users (id) on delete set null,
  -- The clock, not the transaction start, so two sent in one transaction
  -- still sort newest first.
  created_at timestamptz not null default clock_timestamp(),
  constraint driver_updates_driver_fkey
    foreign key (organization_id, driver_id)
    references public.drivers (organization_id, id) on delete cascade,
  constraint driver_updates_path_in_folder
    check (path like organization_id::text || '/' || driver_id::text || '/from-driver/%'),
  constraint driver_updates_reviewed
    check ((status in ('accepted', 'declined')) = (reviewed_at is not null))
);

-- At most one waiting per driver and kind; a newer one replaces it.
create unique index driver_updates_one_pending
  on public.driver_updates (driver_id, kind) where status = 'pending';

create index driver_updates_driver_idx
  on public.driver_updates (organization_id, driver_id, created_at desc);

alter table public.driver_updates enable row level security;

-- Read by the office; written only through the functions below.
grant select on public.driver_updates to authenticated;

create policy "Members can see drivers' updates"
  on public.driver_updates for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

-- Whether the caller may upload this driver-documents path: their own
-- from-driver folder, while they still drive for the carrier.
create function public.driver_can_upload_update(path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folders text[] := storage.foldername(path);
  uuid_pattern text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if cardinality(folders) <> 3
    or folders[1] !~ uuid_pattern
    or folders[2] !~ uuid_pattern
    or folders[3] <> 'from-driver' then
    return false;
  end if;
  return public.is_dq_driver(folders[1]::uuid, folders[2]::uuid);
end;
$$;

revoke execute on function public.driver_can_upload_update(text) from public, anon;
grant execute on function public.driver_can_upload_update(text) to authenticated;

create policy "Drivers can upload a new CDL or medical card"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'driver-documents'
    and (select public.driver_can_upload_update(name))
  );

-- The driver sends a new CDL or medical card, already uploaded to path.
-- Replaces one still waiting. Safe to resend: the same path returns the
-- same update.
create function public.submit_my_driver_update(
  target_driver uuid,
  kind text,
  expires_on date,
  path text,
  file_name text,
  content_type text,
  size_bytes integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  existing uuid;
  created uuid;
begin
  select d.organization_id into org
  from public.drivers d
  where d.id = target_driver
    and d.user_id = (select auth.uid())
    and (d.end_date is null or d.end_date >= current_date);
  if org is null then
    raise exception 'That driver record isn''t yours.' using errcode = '42501';
  end if;

  select u.id into existing from public.driver_updates u where u.path = submit_my_driver_update.path;
  if existing is not null then
    return existing;
  end if;

  if submit_my_driver_update.path not like org::text || '/' || target_driver::text || '/from-driver/%' then
    raise exception 'That file isn''t in your folder.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'driver-documents' and o.name = submit_my_driver_update.path
  ) then
    raise exception 'Upload the file first.' using errcode = 'P0002';
  end if;
  if expires_on < current_date then
    raise exception 'That card has already expired.' using errcode = '22023';
  end if;

  update public.driver_updates u
  set status = 'replaced'
  where u.driver_id = target_driver
    and u.kind = submit_my_driver_update.kind
    and u.status = 'pending';

  insert into public.driver_updates (
    organization_id, driver_id, kind, expires_on, path, file_name,
    content_type, size_bytes, submitted_by
  )
  values (
    org, target_driver, kind, expires_on, path,
    left(coalesce(nullif(trim(file_name), ''), 'Document'), 200),
    content_type, size_bytes, (select auth.uid())
  )
  returning id into created;
  return created;
end;
$$;

revoke execute on function public.submit_my_driver_update(uuid, text, date, text, text, text, integer)
  from public, anon;
grant execute on function public.submit_my_driver_update(uuid, text, date, text, text, text, integer)
  to authenticated;

-- An owner or admin accepts or declines a waiting update. Accepting adds the
-- copy to the driver's documents and sets the expiration date on the driver
-- (corrected_expires_on, if the office read it differently).
create function public.review_driver_update(
  update_id uuid,
  accept boolean,
  corrected_expires_on date default null,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending public.driver_updates;
  expires date;
  document uuid;
begin
  select * into pending from public.driver_updates where id = update_id for update;
  if pending.id is null
    or coalesce(public.organization_role(pending.organization_id), '') not in ('owner', 'admin') then
    raise exception 'Only owners and admins can review drivers'' updates.' using errcode = '42501';
  end if;
  if pending.status <> 'pending' then
    raise exception 'This update was already handled.' using errcode = '22023';
  end if;

  if not accept then
    if nullif(trim(note), '') is null then
      raise exception 'Say why, so the driver can send the right one.' using errcode = '22023';
    end if;
    update public.driver_updates
    set status = 'declined', review_note = left(trim(note), 500),
        reviewed_by = (select auth.uid()), reviewed_at = now()
    where id = update_id;
    return;
  end if;

  expires := coalesce(corrected_expires_on, pending.expires_on);

  insert into public.driver_documents (
    organization_id, driver_id, kind, path, file_name, content_type,
    size_bytes, uploaded_by
  )
  values (
    pending.organization_id, pending.driver_id, pending.kind, pending.path,
    pending.file_name, pending.content_type, pending.size_bytes,
    pending.submitted_by
  )
  returning id into document;

  if pending.kind = 'cdl' then
    update public.drivers set cdl_expires_on = expires
    where organization_id = pending.organization_id and id = pending.driver_id;
  else
    update public.drivers set medical_card_expires_on = expires
    where organization_id = pending.organization_id and id = pending.driver_id;
  end if;

  update public.driver_updates
  set status = 'accepted', expires_on = expires, review_note = nullif(left(trim(note), 500), ''),
      reviewed_by = (select auth.uid()), reviewed_at = now(), driver_document_id = document
  where id = update_id;
end;
$$;

revoke execute on function public.review_driver_update(uuid, boolean, date, text) from public, anon;
grant execute on function public.review_driver_update(uuid, boolean, date, text) to authenticated;

-- my_profile() gains "updates": the latest CDL or medical card the driver
-- sent, per kind, while it's waiting or was declined in the last 30 days.
create or replace function public.my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'driver_id', d.id,
    'full_name', d.full_name,
    'start_date', d.start_date,
    'organization', jsonb_build_object('id', o.id, 'name', o.name, 'phone', o.phone),
    'license_class', d.license_class,
    'cdl_class', d.cdl_class,
    'cdl_state', d.cdl_state,
    'cdl_number_last4', case when d.cdl_number is not null then right(d.cdl_number, 4) end,
    'cdl_endorsements', to_jsonb(d.cdl_endorsements),
    'cdl_restrictions', d.cdl_restrictions,
    'cdl_expires_on', d.cdl_expires_on,
    'medical_card_expires_on', d.medical_card_expires_on,
    'holds_medical_variance', d.holds_medical_variance,
    'pay_type', d.pay_type,
    'pay_rate', d.pay_rate,
    'pay_period', d.pay_period,
    'truck', (
      select jsonb_build_object('unit_number', t.unit_number, 'year', t.year, 'make', t.make, 'model', t.model)
      from public.trucks t
      where t.organization_id = d.organization_id
        and t.default_driver_id = d.id
        and t.status = 'active'
      order by t.unit_number
      limit 1
    ),
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', latest.kind,
        'status', latest.status,
        'expires_on', latest.expires_on,
        'review_note', latest.review_note,
        'sent_at', latest.created_at
      ))
      from (
        select distinct on (u.kind) u.*
        from public.driver_updates u
        where u.organization_id = d.organization_id
          and u.driver_id = d.id
          and u.status <> 'replaced'
        order by u.kind, u.created_at desc
      ) latest
      where latest.status = 'pending'
        or (latest.status = 'declined' and latest.reviewed_at > now() - interval '30 days')
    ), '[]'::jsonb)
  ) order by o.name), '[]'::jsonb)
  from public.drivers d
  join public.organizations o on o.id = d.organization_id
  where d.user_id = (select auth.uid())
    and (d.end_date is null or d.end_date >= current_date);
$$;

-- ---------------------------------------------------------- DQ file -----

-- The signed-in driver's standard DQ file, one entry per carrier: the
-- current checklist (latest cycle of each item, plus earlier ones still
-- open), whether an upload or signature is waiting for the office, and
-- whether the driver can send a document for it. Status is worked out in
-- the app from these dates, as lib/dq-rules.ts does on the web.
create function public.my_dq_file()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'driver_id', d.id,
    'organization', jsonb_build_object('id', o.id, 'name', o.name),
    'set_up', d.start_date is not null,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'code', i.template_code,
        'title', t.title,
        'description', t.description,
        'license_state', i.license_state,
        'due_date', i.due_date,
        'completed_at', i.completed_at,
        'valid_until', i.valid_until,
        'not_applicable', i.not_applicable_reason is not null,
        'pending_review', i.completed_at is null and (
          exists (
            select 1 from public.dq_documents doc
            where doc.dq_item_id = i.id and doc.confirmed_at is null and doc.superseded_at is null
          )
          or exists (
            select 1 from public.dq_attestations a
            where a.dq_item_id = i.id and a.voided_at is null
          )
        ),
        'can_upload', t.evidence in ('document', 'either')
          and i.not_applicable_reason is null
      ) order by t.sort_order, i.license_state, i.cycle_number)
      from (
        select item.*,
          max(item.cycle_number) over (
            partition by item.template_code, coalesce(item.license_state, '')
          ) as latest_cycle
        from public.dq_items item
        where item.organization_id = d.organization_id
          and item.driver_id = d.id
          and item.file_type = 'dq'
      ) i
      join public.dq_requirement_templates t on t.id = i.template_id
      where (i.cycle_number = i.latest_cycle
          or (i.completed_at is null and i.not_applicable_reason is null))
        -- A paired item (the annual review) shows once its pair is started.
        and not (
          t.paired_code is not null
          and i.completed_at is null
          and i.not_applicable_reason is null
          and exists (
            select 1 from public.dq_items pair
            where pair.driver_id = i.driver_id
              and pair.template_code = t.paired_code
              and pair.cycle_number = i.cycle_number
              and pair.completed_at is null
              and not exists (
                select 1 from public.dq_documents doc
                where doc.dq_item_id = pair.id and doc.superseded_at is null
              )
          )
        )
    ), '[]'::jsonb)
  ) order by o.name), '[]'::jsonb)
  from public.drivers d
  join public.organizations o on o.id = d.organization_id
  where d.user_id = (select auth.uid())
    and (d.end_date is null or d.end_date >= current_date);
$$;

revoke execute on function public.my_dq_file() from public, anon;
grant execute on function public.my_dq_file() to authenticated;

-- The driver adds an upload, already in dq-files at path, to one of their
-- items. It waits unconfirmed for the office. Safe to resend: the same path
-- returns the same document.
create function public.add_my_dq_document(
  target_item uuid,
  path text,
  file_name text,
  content_type text,
  size_bytes integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.dq_items;
  takes_document boolean;
  existing uuid;
  created uuid;
begin
  select * into item from public.dq_items where id = target_item;
  if item.id is null
    or item.file_type <> 'dq'
    or not public.is_dq_driver(item.organization_id, item.driver_id) then
    raise exception 'That item isn''t in your file.' using errcode = '42501';
  end if;

  select doc.id into existing from public.dq_documents doc where doc.storage_path = add_my_dq_document.path;
  if existing is not null then
    return existing;
  end if;

  select t.evidence in ('document', 'either') into takes_document
  from public.dq_requirement_templates t where t.id = item.template_id;
  if not takes_document or item.not_applicable_reason is not null then
    raise exception 'That item doesn''t take an upload.' using errcode = '22023';
  end if;
  if add_my_dq_document.path not like item.organization_id::text || '/' || item.driver_id::text || '/dq/%' then
    raise exception 'That file isn''t in your folder.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'dq-files' and o.name = add_my_dq_document.path
  ) then
    raise exception 'Upload the file first.' using errcode = 'P0002';
  end if;

  insert into public.dq_documents (
    organization_id, dq_item_id, storage_path, source, file_name,
    content_type, size_bytes
  )
  values (
    item.organization_id, item.id, path, 'upload',
    left(coalesce(nullif(trim(file_name), ''), 'Document'), 200),
    content_type, size_bytes
  )
  returning id into created;
  return created;
end;
$$;

revoke execute on function public.add_my_dq_document(uuid, text, text, text, integer) from public, anon;
grant execute on function public.add_my_dq_document(uuid, text, text, text, integer) to authenticated;
