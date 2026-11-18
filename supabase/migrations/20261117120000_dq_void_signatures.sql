-- DQ files: voiding a signed note that has a mistake. A signature can't be
-- edited, so a wrong annual review or registry-verification note is voided
-- (with the reason) and signed again. The voided note isn't deleted: it stays
-- in the file's history, marked void, and no longer counts.
--
--   * Only owners and admins can void, only once, and only office notes
--     (the driver's signed employment application isn't voided this way).
--   * Nothing else about a signed record can change, as before. The PDF path
--     is still filled in once, and now only by the person who signed.
--   * A frozen file (the driver left) can't be changed, voids included.

alter table public.dq_attestations
  add column voided_at timestamptz,
  add column voided_by uuid references auth.users (id) on delete set null,
  add column void_reason text check (char_length(trim(void_reason)) between 3 and 500),
  add constraint dq_attestations_void
    check (
      (voided_at is null) = (voided_by is null)
      and (voided_at is null) = (void_reason is null)
    ),
  add constraint dq_attestations_void_office_notes
    check (voided_at is null or type in ('annual_review', 'registry_verification'));

create or replace function public.dq_attestations_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item public.dq_items;
  role text;
  path text;
  reason text;
  voiding boolean;
begin
  if tg_op = 'INSERT' then
    select * into item from public.dq_items
    where organization_id = new.organization_id and id = new.dq_item_id;
    perform public.dq_refuse_if_frozen(item.driver_id);
    new.driver_id := item.driver_id;
    new.file_type := item.file_type;
    new.signed_at := now();
    new.created_at := now();
    new.voided_at := null;
    new.voided_by := null;
    new.void_reason := null;
    if current_user = 'authenticated' then
      new.signer_id := (select auth.uid());
      role := public.organization_role(new.organization_id);
      new.signer_role := case
        when role in ('owner', 'admin') then role
        when public.is_dq_driver(new.organization_id, new.driver_id) then 'driver'
      end;
    end if;
    return new;
  end if;

  if old.voided_at is not null then
    raise exception 'A voided record can''t be changed.'
      using errcode = '42501', hint = 'voided';
  end if;

  -- The PDF path is filled in once, by the signer.
  if new.pdf_path is distinct from old.pdf_path then
    if old.pdf_path is not null
      or (current_user = 'authenticated' and old.signer_id is distinct from (select auth.uid())) then
      raise exception 'A signed record can''t be changed.'
        using errcode = '42501', hint = 'signed';
    end if;
  end if;

  voiding := new.voided_at is not null;
  path := new.pdf_path;
  reason := new.void_reason;
  -- Everything else stays as it was signed.
  new := old;
  new.pdf_path := path;

  if voiding then
    perform public.dq_refuse_if_frozen(old.driver_id);
    if current_user = 'authenticated' and not public.can_manage_dq(old.organization_id) then
      raise exception 'Only owners and admins can void a signed record.'
        using errcode = '42501', hint = 'not_allowed';
    end if;
    if reason is null or char_length(trim(reason)) < 3 then
      raise exception 'Say why it''s being voided.'
        using errcode = '22023', hint = 'void_reason';
    end if;
    new.voided_at := now();
    new.voided_by := (select auth.uid());
    new.void_reason := trim(reason);
  end if;
  return new;
end;
$$;

grant update (voided_at, void_reason) on public.dq_attestations to authenticated;

create policy "Owners and admins can void signed records"
  on public.dq_attestations for update
  to authenticated
  using ((select public.can_manage_dq(organization_id)) and voided_at is null)
  with check ((select public.can_manage_dq(organization_id)));
