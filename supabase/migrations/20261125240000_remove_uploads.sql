-- Drivers see what they've uploaded from the app and can take it back while
-- it's still waiting. Once the office has accepted or confirmed something,
-- it's part of the record and only viewed.
--
--   * Load paperwork: their own upload, while the load is on the road. The
--     document is deleted, and the load's status follows its paperwork
--     again (load_documents_sync_status), as when the office removes one.
--   * A new CDL or medical card: withdrawn while pending. Kept, marked
--     withdrawn, like a replaced one.
--   * A DQ upload: their own, while unconfirmed. Never deleted: marked
--     superseded by itself, as the web's remove does, so it leaves the
--     checklist but stays in storage and the audit log.
--
-- Also lets the driver open the CDL or medical card copy they sent, and
-- lists each DQ item's documents in my_dq_file().

-- ---------------------------------------------- CDL and medical card -----

alter table public.driver_updates drop constraint driver_updates_status_check;
alter table public.driver_updates add constraint driver_updates_status_check
  check (status in ('pending', 'accepted', 'declined', 'replaced', 'withdrawn'));

create policy "Drivers can see the CDL or medical card they sent"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'driver-documents'
    and (select public.driver_can_upload_update(name))
  );

-- The driver takes back a CDL or medical card the office hasn't reviewed.
create function public.withdraw_my_driver_update(update_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  found public.driver_updates;
begin
  select u.* into found
  from public.driver_updates u
  join public.drivers d on d.organization_id = u.organization_id and d.id = u.driver_id
  where u.id = update_id
    and d.user_id = (select auth.uid())
    and (d.end_date is null or d.end_date >= current_date)
  for update of u;
  if found.id is null then
    raise exception 'That isn''t one you sent.' using errcode = '42501';
  end if;
  if found.status <> 'pending' then
    raise exception 'The office already handled it, so it can''t be taken back.' using errcode = '22023';
  end if;
  update public.driver_updates set status = 'withdrawn' where id = update_id;
end;
$$;

revoke execute on function public.withdraw_my_driver_update(uuid) from public, anon;
grant execute on function public.withdraw_my_driver_update(uuid) to authenticated;

-- my_profile(): each update gains its id and path, so the app can open the
-- copy and take it back. A withdrawn one hides what came before it.
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
        'id', latest.id,
        'kind', latest.kind,
        'status', latest.status,
        'expires_on', latest.expires_on,
        'review_note', latest.review_note,
        'path', latest.path,
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

-- ------------------------------------------------------ Load paperwork -----

-- The driver removes a BOL, POD or receipt they uploaded, while the load is
-- on the road. The file stays in storage.
create function public.remove_my_load_document(target_document uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.load_documents;
begin
  select * into doc from public.load_documents where id = target_document;
  if doc.id is null or doc.uploaded_by is distinct from (select auth.uid()) then
    raise exception 'That isn''t paperwork you added.' using errcode = '42501';
  end if;
  perform public.require_my_load_on_road(doc.load_id);
  delete from public.load_documents where id = target_document;
end;
$$;

revoke execute on function public.remove_my_load_document(uuid) from public, anon;
grant execute on function public.remove_my_load_document(uuid) to authenticated;

-- ------------------------------------------------------------ DQ file -----

-- The driver takes back an upload the office hasn't confirmed.
create function public.remove_my_dq_document(target_document uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.dq_documents;
begin
  select * into doc from public.dq_documents where id = target_document for update;
  if doc.id is null
    or doc.uploaded_by is distinct from (select auth.uid())
    or not public.is_dq_driver(doc.organization_id, doc.driver_id) then
    raise exception 'That isn''t one you sent.' using errcode = '42501';
  end if;
  if doc.superseded_at is not null then
    raise exception 'It was already removed or replaced.' using errcode = '22023';
  end if;
  if doc.confirmed_at is not null then
    raise exception 'The office already confirmed it, so it can''t be taken back.' using errcode = '22023';
  end if;
  update public.dq_documents
  set superseded_at = now(), superseded_by = id
  where id = target_document;
end;
$$;

revoke execute on function public.remove_my_dq_document(uuid) from public, anon;
grant execute on function public.remove_my_dq_document(uuid) to authenticated;

-- my_dq_file(): each item lists its live documents (not removed or
-- replaced), with whether the driver sent it and whether it's confirmed.
create or replace function public.my_dq_file()
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
          and i.not_applicable_reason is null,
        'documents', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', doc.id,
            'path', doc.storage_path,
            'file_name', doc.file_name,
            'created_at', doc.created_at,
            'confirmed', doc.confirmed_at is not null,
            'mine', doc.uploaded_by = (select auth.uid())
          ) order by doc.created_at desc)
          from public.dq_documents doc
          where doc.dq_item_id = i.id and doc.superseded_at is null
        ), '[]'::jsonb)
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
