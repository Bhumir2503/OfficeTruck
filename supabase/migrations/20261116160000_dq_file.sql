-- Driver Qualification (DQ) files, step 1: the schema. See docs/dq-file-spec.md.
--
--   * drivers gains the facts the checklist is built from (license class,
--     prior license states, start and end dates) and a login: the office sets
--     the driver's phone number, and when someone signs in with that number
--     (an SMS code) claim_driver_logins() links them to the driver. Drivers
--     are never added to organization_users, so none of the office's other
--     data is visible to them.
--   * dq_requirement_templates and dq_state_rules are shared, read-only rules
--     with effective dates; the next migration seeds them.
--   * dq_items is one row per driver, requirement and cycle. Status is never
--     stored; it's worked out from the dates.
--   * Three file types: the standard DQ file, the investigation (safety
--     performance history) file, and the drug and alcohol file. Only owners
--     and admins see the last two. Members see the standard file. A driver
--     sees the standard file for themselves only.
--   * Nothing is hard-deleted: there are no delete grants or policies, and a
--     trigger refuses deletes that don't come from deleting the organization
--     or driver. Replaced documents are marked superseded.
--   * Every insert and update is written to dq_audit_log by triggers, with
--     the encrypted SSN and date of birth left out.
--   * Document dates are only set together with a person's confirmation, so
--     an AI reading can propose (ai_extraction) but never decide.

create extension if not exists btree_gist with schema extensions;

-- ------------------------------------------------------- Driver facts -----

alter table public.drivers
  add column license_class text check (license_class in ('cdl', 'clp', 'non_cdl')),
  -- Other states that licensed the driver in the past 3 years, besides
  -- cdl_state (their current license state, for CDL and non-CDL alike).
  add column prior_license_states text[] not null default '{}'
    check (
      cardinality(prior_license_states) <= 10
      and prior_license_states <@ array[
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI',
        'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN',
        'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
        'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
        'WV', 'WI', 'WY', 'AS', 'GU', 'MP', 'PR', 'VI'
      ]::text[]
    ),
  add column start_date date,
  -- Setting it stops recurring work and freezes the file the day after.
  add column end_date date,
  -- Holds a medical variance, SPE certificate or exemption (item 7).
  add column holds_medical_variance boolean not null default false,
  -- The number the driver signs in with, as +15551234567.
  add column login_phone text check (login_phone ~ '^\+[1-9][0-9]{7,14}$'),
  -- Set only by claim_driver_logins().
  add column user_id uuid references auth.users (id) on delete set null,
  add constraint drivers_end_after_start
    check (end_date is null or start_date is null or end_date >= start_date),
  add constraint drivers_organization_login_phone_key unique (organization_id, login_phone),
  add constraint drivers_organization_user_key unique (organization_id, user_id);

create index drivers_user_id_idx on public.drivers (user_id) where user_id is not null;

-- People using the app can't link a login to a driver themselves (that would
-- hand someone the driver's file); only claim_driver_logins() can, after the
-- phone number is verified. Changing the phone number unlinks the old login.
create function public.drivers_guard_login()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' then
      new.user_id := null;
    end if;
    return new;
  end if;

  if new.login_phone is distinct from old.login_phone then
    new.user_id := null;
  elsif current_user = 'authenticated'
    and new.user_id is not null
    and new.user_id is distinct from old.user_id then
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

create trigger drivers_guard_login
  before insert or update on public.drivers
  for each row execute function public.drivers_guard_login();

-- Links the signed-in user to every driver whose login phone matches their
-- verified phone number. Called after a driver signs in with an SMS code.
-- Returns how many drivers were linked.
create function public.claim_driver_logins()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  verified text;
  claimed integer;
begin
  if caller is null then
    return 0;
  end if;

  select u.phone into verified
  from auth.users u
  where u.id = caller
    and u.phone_confirmed_at is not null;

  if verified is null or verified = '' then
    return 0;
  end if;

  update public.drivers d
  set user_id = caller
  where d.user_id is null
    and d.login_phone = '+' || ltrim(verified, '+')
    and (d.end_date is null or d.end_date >= current_date)
    and not exists (
      select 1
      from public.drivers other
      where other.organization_id = d.organization_id
        and other.user_id = caller
    );

  get diagnostics claimed = row_count;
  return claimed;
end;
$$;

revoke execute on function public.claim_driver_logins() from public, anon;
grant execute on function public.claim_driver_logins() to authenticated;

-- ------------------------------------------------------------ Helpers -----

-- True when the caller is signed in as this driver, and the driver hasn't
-- left. Security definer so policies can read drivers without the caller
-- having access to the drivers table.
create function public.is_dq_driver(org_id uuid, target_driver uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.drivers
    where organization_id = org_id
      and id = target_driver
      and user_id = (select auth.uid())
      and (end_date is null or end_date >= current_date)
  );
$$;

-- Owners and admins manage DQ files, the restricted ones included.
create function public.can_manage_dq(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.organization_role(org_id) in ('owner', 'admin');
$$;

-- Who can see a driver's file of a type: owners and admins see all three;
-- members and the driver themselves only the standard DQ file.
create function public.can_view_dq(org_id uuid, target_driver uuid, kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.organization_role(org_id) in ('owner', 'admin') then true
    when kind <> 'dq' then false
    when public.organization_role(org_id) = 'member' then true
    else public.is_dq_driver(org_id, target_driver)
  end;
$$;

-- A driver's file is frozen (read-only) once their end date has passed.
create function public.dq_file_frozen(target_driver uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select end_date < current_date from public.drivers where id = target_driver),
    false
  );
$$;

revoke execute on function public.is_dq_driver(uuid, uuid) from public, anon;
revoke execute on function public.can_manage_dq(uuid) from public, anon;
revoke execute on function public.can_view_dq(uuid, uuid, text) from public, anon;
revoke execute on function public.dq_file_frozen(uuid) from public, anon;
grant execute on function public.is_dq_driver(uuid, uuid) to authenticated;
grant execute on function public.can_manage_dq(uuid) to authenticated;
grant execute on function public.can_view_dq(uuid, uuid, text) to authenticated;
grant execute on function public.dq_file_frozen(uuid) to authenticated;

-- Refuses a delete, unless it's part of deleting the organization or driver
-- (a cascade from a foreign key runs one trigger level deeper).
create function public.dq_refuse_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() < 2 then
    raise exception 'DQ records can''t be deleted. Mark a document superseded instead.'
      using errcode = '42501', hint = 'no_delete';
  end if;
  return old;
end;
$$;

-- Refuses changes to a frozen file.
create function public.dq_refuse_if_frozen(target_driver uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if public.dq_file_frozen(target_driver) then
    raise exception 'This driver has left; their file is read-only.'
      using errcode = '42501', hint = 'file_frozen';
  end if;
end;
$$;

-- ------------------------------------------------------- Shared rules -----

-- The checklist rules. Rows for the same code can't overlap in time; when a
-- rule changes, end the old row (effective_to, exclusive) and add a new one.
create table public.dq_requirement_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,59}$'),
  title text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 1000),
  cfr_ref text not null check (char_length(cfr_ref) between 1 and 100),
  file_type text not null check (file_type in ('dq', 'investigation', 'drug_alcohol')),
  -- conditional: only for drivers a fact applies to (holds_medical_variance),
  -- or created by another item (the Clearinghouse escalation).
  applies_to text not null check (applies_to in ('all', 'cdl', 'non_cdl', 'conditional')),
  --   before_first_trip  due on the start date
  --   days_after_start   due due_offset_days after the start date
  --   months_after_start first due recurrence_months after the start date
  --   with_paired        due with the paired item (paired_code)
  --   hours_after_trigger due due_offset_hours after the item that triggered it
  -- Items with max_validity_months come due again when the confirmed expiry
  -- date runs out.
  due_rule text not null check (due_rule in (
    'before_first_trip', 'days_after_start', 'months_after_start',
    'with_paired', 'hours_after_trigger'
  )),
  due_offset_days integer check (due_offset_days between 0 and 365),
  due_offset_hours integer check (due_offset_hours between 1 and 720),
  -- How often it comes round again; null if it doesn't.
  recurrence_months integer check (recurrence_months between 1 and 120),
  -- The longest a completed one can be valid (medical proof: 24 months),
  -- though the actual expiry date on the document is what counts.
  max_validity_months integer check (max_validity_months between 1 and 120),
  -- One per state that licensed the driver in the past 3 years.
  per_state boolean not null default false,
  paired_code text check (paired_code ~ '^[a-z][a-z0-9_]{1,59}$'),
  -- What completes it: an uploaded document, a signed record, either, or
  -- the previous-employer contact log.
  evidence text not null check (evidence in ('document', 'attestation', 'either', 'contact_log')),
  attestation_type text check (attestation_type in (
    'employment_application', 'annual_review', 'registry_verification'
  )),
  --   employment_plus_years  kept for the employment plus retention_years
  --   from_item_years        kept retention_years from the item's own date
  --   no_auto_delete         varies; never flagged automatically
  retention_rule text not null check (retention_rule in (
    'employment_plus_years', 'from_item_years', 'no_auto_delete'
  )),
  retention_years integer check (retention_years between 1 and 10),
  sort_order integer not null,
  effective_from date not null default '-infinity',
  effective_to date not null default 'infinity',
  created_at timestamptz not null default now(),
  constraint dq_requirement_templates_effective_order
    check (effective_to > effective_from),
  constraint dq_requirement_templates_retention_years
    check ((retention_rule = 'no_auto_delete') = (retention_years is null)),
  constraint dq_requirement_templates_days_offset
    check ((due_rule = 'days_after_start') = (due_offset_days is not null)),
  constraint dq_requirement_templates_hours_offset
    check ((due_rule = 'hours_after_trigger') = (due_offset_hours is not null)),
  constraint dq_requirement_templates_paired
    check ((due_rule = 'with_paired') = (paired_code is not null)),
  constraint dq_requirement_templates_months_after_start
    check (due_rule <> 'months_after_start' or recurrence_months is not null),
  constraint dq_requirement_templates_attestation
    check ((evidence in ('attestation', 'either')) = (attestation_type is not null)),
  constraint dq_requirement_templates_no_overlap
    exclude using gist (code with =, daterange(effective_from, effective_to) with &&)
);

-- Per-state settings, dated the same way. v1 has one: the grace period, in
-- days, for paper medical cards after the CDL medical-proof change (default
-- 0 when a state has no row).
create table public.dq_state_rules (
  id uuid primary key default gen_random_uuid(),
  state text not null check (state ~ '^[A-Z]{2}$'),
  rule text not null check (rule in ('paper_medical_card_grace_days')),
  value integer not null check (value between 0 and 3650),
  note text check (char_length(note) <= 500),
  effective_from date not null default '-infinity',
  effective_to date not null default 'infinity',
  created_at timestamptz not null default now(),
  constraint dq_state_rules_effective_order check (effective_to > effective_from),
  constraint dq_state_rules_no_overlap
    exclude using gist (state with =, rule with =, daterange(effective_from, effective_to) with &&)
);

alter table public.dq_requirement_templates enable row level security;
alter table public.dq_state_rules enable row level security;

grant select on public.dq_requirement_templates to authenticated;
grant select on public.dq_state_rules to authenticated;

create policy "Anyone signed in can read the DQ rules"
  on public.dq_requirement_templates for select
  to authenticated
  using (true);

create policy "Anyone signed in can read the state rules"
  on public.dq_state_rules for select
  to authenticated
  using (true);

-- ----------------------------------------------------------- Items -----

create table public.dq_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  driver_id uuid not null,
  template_id uuid not null references public.dq_requirement_templates (id),
  -- Copied from the template on insert, so policies and queries needn't join.
  template_code text not null,
  file_type text not null check (file_type in ('dq', 'investigation', 'drug_alcohol')),
  -- For per-state items: the state this one is for.
  license_state text check (license_state ~ '^[A-Z]{2}$'),
  cycle_number integer not null default 1 check (cycle_number between 1 and 1000),
  due_date date,
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  -- When a completed item stops counting (an expiry date, or the next cycle).
  valid_until date,
  -- For Clearinghouse queries: what the confirmed result showed.
  query_result text check (query_result in ('no_record', 'record_found')),
  -- The item that caused this one (a limited query that found a record).
  triggered_by_item_id uuid,
  not_applicable_reason text check (char_length(trim(not_applicable_reason)) between 3 and 500),
  not_applicable_by uuid references auth.users (id) on delete set null,
  not_applicable_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dq_items_organization_id_id_key unique (organization_id, id),
  constraint dq_items_driver_fkey
    foreign key (organization_id, driver_id)
    references public.drivers (organization_id, id) on delete cascade,
  constraint dq_items_triggered_by_fkey
    foreign key (organization_id, triggered_by_item_id)
    references public.dq_items (organization_id, id),
  constraint dq_items_completed_by
    check ((completed_at is null) = (completed_by is null)),
  constraint dq_items_not_applicable
    check (
      (not_applicable_reason is null) = (not_applicable_at is null)
      and (not_applicable_reason is null) = (not_applicable_by is null)
    ),
  constraint dq_items_complete_or_not_applicable
    check (completed_at is null or not_applicable_reason is null)
);

create unique index dq_items_cycle_key
  on public.dq_items (driver_id, template_code, coalesce(license_state, ''), cycle_number);

create index dq_items_driver_idx on public.dq_items (organization_id, driver_id, file_type);

-- Due work across a fleet, for reminders and the compliance calendar.
create index dq_items_due_idx
  on public.dq_items (organization_id, due_date)
  where completed_at is null and not_applicable_reason is null;

create function public.dq_items_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  rule public.dq_requirement_templates;
begin
  perform public.dq_refuse_if_frozen(
    case when tg_op = 'INSERT' then new.driver_id else old.driver_id end
  );

  if tg_op = 'INSERT' then
    select * into rule from public.dq_requirement_templates where id = new.template_id;
    new.template_code := rule.code;
    new.file_type := rule.file_type;
    new.created_by := (select auth.uid());
    new.created_at := now();
  else
    new.organization_id := old.organization_id;
    new.driver_id := old.driver_id;
    new.template_id := old.template_id;
    new.template_code := old.template_code;
    new.file_type := old.file_type;
    new.license_state := old.license_state;
    new.cycle_number := old.cycle_number;
    new.triggered_by_item_id := old.triggered_by_item_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  -- Whoever completes it or marks it not applicable is the person signed in.
  if current_user = 'authenticated' then
    if new.completed_at is not null
      and (tg_op = 'INSERT' or new.completed_at is distinct from old.completed_at) then
      new.completed_by := (select auth.uid());
    end if;
    if new.not_applicable_reason is not null
      and (tg_op = 'INSERT' or new.not_applicable_reason is distinct from old.not_applicable_reason) then
      new.not_applicable_by := (select auth.uid());
      new.not_applicable_at := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger dq_items_before_write
  before insert or update on public.dq_items
  for each row execute function public.dq_items_before_write();

create trigger dq_items_refuse_delete
  before delete on public.dq_items
  for each row execute function public.dq_refuse_delete();

alter table public.dq_items enable row level security;

grant select, insert, update on public.dq_items to authenticated;

create policy "People who can see the file can see its items"
  on public.dq_items for select
  to authenticated
  using ((select public.can_view_dq(organization_id, driver_id, file_type)));

create policy "Owners and admins can add items"
  on public.dq_items for insert
  to authenticated
  with check ((select public.can_manage_dq(organization_id)));

create policy "Owners and admins can update items"
  on public.dq_items for update
  to authenticated
  using ((select public.can_manage_dq(organization_id)))
  with check ((select public.can_manage_dq(organization_id)));

-- --------------------------------------------------------- Documents -----

-- Files live in the dq-files bucket at
-- <organization>/<driver>/<file type>/<file>, so storage policies can tell
-- which file a document belongs to.
create table public.dq_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Both copied from the item on insert.
  driver_id uuid not null,
  file_type text not null check (file_type in ('dq', 'investigation', 'drug_alcohol')),
  dq_item_id uuid not null,
  storage_path text not null unique check (char_length(storage_path) <= 300),
  source text not null check (source in ('upload', 'generated')),
  file_name text not null check (char_length(trim(file_name)) between 1 and 200),
  content_type text not null check (content_type in (
    'image/png', 'image/jpeg', 'image/webp', 'application/pdf'
  )),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  -- What an AI reading proposed: document type, name, dates, which item.
  -- Never trusted on its own; a person confirms the dates below.
  ai_extraction jsonb check (jsonb_typeof(ai_extraction) = 'object'),
  ai_extracted_at timestamptz,
  -- Confirmed by a person.
  issue_date date,
  expiry_date date,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  superseded_at timestamptz,
  superseded_by uuid,
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint dq_documents_organization_id_id_key unique (organization_id, id),
  constraint dq_documents_item_fkey
    foreign key (organization_id, dq_item_id)
    references public.dq_items (organization_id, id) on delete cascade,
  constraint dq_documents_superseded_by_fkey
    foreign key (organization_id, superseded_by)
    references public.dq_documents (organization_id, id),
  constraint dq_documents_path_in_folder
    check (storage_path like organization_id::text || '/' || driver_id::text || '/' || file_type || '/%'),
  constraint dq_documents_confirmed
    check ((confirmed_at is null) = (confirmed_by is null)),
  -- Dates only count once a person confirms them.
  constraint dq_documents_dates_need_confirmation
    check (confirmed_at is not null or (issue_date is null and expiry_date is null)),
  constraint dq_documents_date_order
    check (expiry_date is null or issue_date is null or expiry_date >= issue_date),
  constraint dq_documents_superseded
    check ((superseded_at is null) = (superseded_by is null))
);

create index dq_documents_item_idx on public.dq_documents (organization_id, dq_item_id, created_at);

create function public.dq_documents_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item public.dq_items;
  manager boolean;
begin
  if tg_op = 'INSERT' then
    select * into item from public.dq_items
    where organization_id = new.organization_id and id = new.dq_item_id;
    new.driver_id := item.driver_id;
    new.file_type := item.file_type;
    new.uploaded_by := (select auth.uid());
    new.created_at := now();
    new.superseded_at := null;
    new.superseded_by := null;
    perform public.dq_refuse_if_frozen(new.driver_id);
    if current_user = 'authenticated' and new.confirmed_at is not null then
      new.confirmed_by := (select auth.uid());
    end if;
    return new;
  end if;

  perform public.dq_refuse_if_frozen(old.driver_id);

  if old.superseded_at is not null then
    raise exception 'A superseded document can''t be changed.'
      using errcode = '42501', hint = 'superseded';
  end if;

  -- What it is and where it lives never change.
  new.organization_id := old.organization_id;
  new.driver_id := old.driver_id;
  new.file_type := old.file_type;
  new.dq_item_id := old.dq_item_id;
  new.storage_path := old.storage_path;
  new.source := old.source;
  new.file_name := old.file_name;
  new.content_type := old.content_type;
  new.size_bytes := old.size_bytes;
  new.uploaded_by := old.uploaded_by;
  new.created_at := old.created_at;

  if current_user = 'authenticated' then
    manager := public.can_manage_dq(old.organization_id);
    -- A driver may only record the AI reading of their own unconfirmed upload.
    if not manager then
      new.issue_date := old.issue_date;
      new.expiry_date := old.expiry_date;
      new.confirmed_at := old.confirmed_at;
      new.confirmed_by := old.confirmed_by;
      new.superseded_at := old.superseded_at;
      new.superseded_by := old.superseded_by;
    elsif new.confirmed_at is distinct from old.confirmed_at and new.confirmed_at is not null then
      new.confirmed_by := (select auth.uid());
    elsif new.confirmed_at is not distinct from old.confirmed_at
      and (new.issue_date is distinct from old.issue_date
        or new.expiry_date is distinct from old.expiry_date) then
      -- Corrected dates are a new confirmation by the person correcting them.
      new.confirmed_at := now();
      new.confirmed_by := (select auth.uid());
    end if;
  end if;

  return new;
end;
$$;

create trigger dq_documents_before_write
  before insert or update on public.dq_documents
  for each row execute function public.dq_documents_before_write();

create trigger dq_documents_refuse_delete
  before delete on public.dq_documents
  for each row execute function public.dq_refuse_delete();

alter table public.dq_documents enable row level security;

grant select, insert on public.dq_documents to authenticated;
grant update (
  ai_extraction, ai_extracted_at, issue_date, expiry_date,
  confirmed_at, superseded_at, superseded_by
) on public.dq_documents to authenticated;

create policy "People who can see the file can see its documents"
  on public.dq_documents for select
  to authenticated
  using ((select public.can_view_dq(organization_id, driver_id, file_type)));

create policy "Owners, admins and the driver can add documents"
  on public.dq_documents for insert
  to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (
      (select public.can_manage_dq(organization_id))
      or (
        file_type = 'dq'
        and source = 'upload'
        and confirmed_at is null
        and (select public.is_dq_driver(organization_id, driver_id))
      )
    )
  );

create policy "Owners, admins and the driver can update documents"
  on public.dq_documents for update
  to authenticated
  using (
    (select public.can_manage_dq(organization_id))
    or (
      file_type = 'dq'
      and confirmed_at is null
      and uploaded_by = (select auth.uid())
      and (select public.is_dq_driver(organization_id, driver_id))
    )
  )
  with check (
    (select public.can_manage_dq(organization_id))
    or (
      file_type = 'dq'
      and confirmed_at is null
      and uploaded_by = (select auth.uid())
      and (select public.is_dq_driver(organization_id, driver_id))
    )
  );

-- ------------------------------------------------------- Attestations -----

-- Signed records. Each is signed by the person signed in, who must be the
-- right person for its type: the driver for their application, an owner or
-- admin for review and verification notes.
create table public.dq_attestations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Both copied from the item on insert.
  driver_id uuid not null,
  file_type text not null check (file_type in ('dq', 'investigation', 'drug_alcohol')),
  dq_item_id uuid not null,
  type text not null check (type in (
    'employment_application', 'annual_review', 'registry_verification'
  )),
  signer_id uuid not null default auth.uid() references auth.users (id),
  signer_name text not null check (char_length(trim(signer_name)) between 1 and 120),
  signer_role text not null check (signer_role in ('owner', 'admin', 'driver')),
  signed_at timestamptz not null default now(),
  statement_text text not null check (char_length(trim(statement_text)) between 10 and 5000),
  -- The generated PDF. Set once, after it's made.
  pdf_path text unique check (char_length(pdf_path) <= 300),
  created_at timestamptz not null default now(),
  constraint dq_attestations_organization_id_id_key unique (organization_id, id),
  constraint dq_attestations_item_fkey
    foreign key (organization_id, dq_item_id)
    references public.dq_items (organization_id, id) on delete cascade,
  constraint dq_attestations_pdf_in_folder
    check (pdf_path is null or pdf_path like organization_id::text || '/' || driver_id::text || '/' || file_type || '/%')
);

create index dq_attestations_item_idx on public.dq_attestations (organization_id, dq_item_id);

create function public.dq_attestations_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item public.dq_items;
  role text;
  path text;
begin
  if tg_op = 'INSERT' then
    select * into item from public.dq_items
    where organization_id = new.organization_id and id = new.dq_item_id;
    perform public.dq_refuse_if_frozen(item.driver_id);
    new.driver_id := item.driver_id;
    new.file_type := item.file_type;
    new.signed_at := now();
    new.created_at := now();
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

  -- Signed records don't change; only the PDF path is filled in, once.
  if old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path then
    raise exception 'A signed record can''t be changed.'
      using errcode = '42501', hint = 'signed';
  end if;
  path := new.pdf_path;
  new := old;
  new.pdf_path := path;
  return new;
end;
$$;

create trigger dq_attestations_before_write
  before insert or update on public.dq_attestations
  for each row execute function public.dq_attestations_before_write();

create trigger dq_attestations_refuse_delete
  before delete on public.dq_attestations
  for each row execute function public.dq_refuse_delete();

alter table public.dq_attestations enable row level security;

grant select, insert on public.dq_attestations to authenticated;
grant update (pdf_path) on public.dq_attestations to authenticated;

create policy "People who can see the file can see its signed records"
  on public.dq_attestations for select
  to authenticated
  using ((select public.can_view_dq(organization_id, driver_id, file_type)));

create policy "The right person signs each record"
  on public.dq_attestations for insert
  to authenticated
  with check (
    signer_id = (select auth.uid())
    and (
      (
        type in ('annual_review', 'registry_verification')
        and signer_role in ('owner', 'admin')
        and (select public.can_manage_dq(organization_id))
      )
      or (
        type = 'employment_application'
        and file_type = 'dq'
        and signer_role = 'driver'
        and (select public.is_dq_driver(organization_id, driver_id))
      )
    )
  );

create policy "The signer can attach the PDF"
  on public.dq_attestations for update
  to authenticated
  using (signer_id = (select auth.uid()) and pdf_path is null)
  with check (signer_id = (select auth.uid()));

-- ---------------------------------------------- Employment application -----

-- The driver's answers on the employment application (391.21). The SSN and
-- date of birth are encrypted by the app server before they get here
-- (lib/dq-crypto.ts); the database never sees them in the clear. Only the
-- last 4 digits of the SSN are kept readable, for display. Editable by the
-- driver until it's signed, then fixed.
create table public.dq_employment_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  driver_id uuid not null,
  dq_item_id uuid not null,
  -- Everything else on the form: addresses, license and employment history,
  -- accidents and violations. Checked by the app's schema.
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
  ssn_ciphertext text check (ssn_ciphertext ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'),
  ssn_last4 text check (ssn_last4 ~ '^[0-9]{4}$'),
  date_of_birth_ciphertext text check (date_of_birth_ciphertext ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'),
  attestation_id uuid,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dq_employment_applications_item_key unique (dq_item_id),
  constraint dq_employment_applications_item_fkey
    foreign key (organization_id, dq_item_id)
    references public.dq_items (organization_id, id) on delete cascade,
  constraint dq_employment_applications_attestation_fkey
    foreign key (organization_id, attestation_id)
    references public.dq_attestations (organization_id, id),
  constraint dq_employment_applications_ssn_pair
    check ((ssn_ciphertext is null) = (ssn_last4 is null))
);

create function public.dq_employment_applications_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item public.dq_items;
begin
  if tg_op = 'INSERT' then
    select * into item from public.dq_items
    where organization_id = new.organization_id and id = new.dq_item_id;
    if item.template_code is distinct from 'employment_application' then
      raise exception 'That item isn''t an employment application.'
        using errcode = '22023', hint = 'wrong_item';
    end if;
    new.driver_id := item.driver_id;
    new.attestation_id := null;
    new.created_by := (select auth.uid());
    new.created_at := now();
  else
    if old.attestation_id is not null then
      raise exception 'A signed application can''t be changed.'
        using errcode = '42501', hint = 'signed';
    end if;
    new.organization_id := old.organization_id;
    new.driver_id := old.driver_id;
    new.dq_item_id := old.dq_item_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    -- Signing links the driver's own signature on this application.
    if new.attestation_id is not null and not exists (
      select 1 from public.dq_attestations a
      where a.organization_id = new.organization_id
        and a.id = new.attestation_id
        and a.dq_item_id = new.dq_item_id
        and a.type = 'employment_application'
        and a.signer_id = (select auth.uid())
    ) then
      raise exception 'Sign the application before submitting it.'
        using errcode = '22023', hint = 'not_signed';
    end if;
  end if;

  perform public.dq_refuse_if_frozen(new.driver_id);
  new.updated_at := now();
  return new;
end;
$$;

create trigger dq_employment_applications_before_write
  before insert or update on public.dq_employment_applications
  for each row execute function public.dq_employment_applications_before_write();

create trigger dq_employment_applications_refuse_delete
  before delete on public.dq_employment_applications
  for each row execute function public.dq_refuse_delete();

alter table public.dq_employment_applications enable row level security;

grant select, insert on public.dq_employment_applications to authenticated;
grant update (
  answers, ssn_ciphertext, ssn_last4, date_of_birth_ciphertext, attestation_id
) on public.dq_employment_applications to authenticated;

-- Members don't see the application's answers, only that it's on file.
create policy "Owners, admins and the driver can see the application"
  on public.dq_employment_applications for select
  to authenticated
  using (
    (select public.can_manage_dq(organization_id))
    or (select public.is_dq_driver(organization_id, driver_id))
  );

create policy "The driver fills in their application"
  on public.dq_employment_applications for insert
  to authenticated
  with check ((select public.is_dq_driver(organization_id, driver_id)));

create policy "The driver edits their application until it's signed"
  on public.dq_employment_applications for update
  to authenticated
  using ((select public.is_dq_driver(organization_id, driver_id)))
  with check ((select public.is_dq_driver(organization_id, driver_id)));

-- -------------------------------------------- Previous-employer checks -----

-- The investigation file's contact log (391.23, 391.53): every attempt to
-- reach a previous employer, failed ones included. Owners and admins only.
-- Each contact is a new row; nothing is edited.
create table public.dq_employer_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  driver_id uuid not null,
  employer_name text not null check (char_length(trim(employer_name)) between 1 and 200),
  employer_address text check (char_length(employer_address) <= 500),
  contacted_at timestamptz not null,
  method text not null check (method in ('phone', 'email', 'fax', 'mail', 'in_person', 'other')),
  outcome text not null check (outcome in (
    'response_received', 'no_response', 'declined', 'no_record_of_driver', 'attempt_failed'
  )),
  -- What they said.
  response_summary text check (char_length(response_summary) <= 5000),
  response_document_id uuid,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint dq_employer_checks_driver_fkey
    foreign key (organization_id, driver_id)
    references public.drivers (organization_id, id) on delete cascade,
  constraint dq_employer_checks_document_fkey
    foreign key (organization_id, response_document_id)
    references public.dq_documents (organization_id, id)
);

create index dq_employer_checks_driver_idx
  on public.dq_employer_checks (organization_id, driver_id, contacted_at);

create function public.dq_employer_checks_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.dq_refuse_if_frozen(new.driver_id);
  new.created_by := (select auth.uid());
  new.created_at := now();
  if new.contacted_at > now() + interval '1 hour' then
    raise exception 'The contact date can''t be in the future.'
      using errcode = '22023', hint = 'future_date';
  end if;
  return new;
end;
$$;

create trigger dq_employer_checks_before_insert
  before insert on public.dq_employer_checks
  for each row execute function public.dq_employer_checks_before_insert();

create trigger dq_employer_checks_refuse_delete
  before delete on public.dq_employer_checks
  for each row execute function public.dq_refuse_delete();

alter table public.dq_employer_checks enable row level security;

grant select, insert on public.dq_employer_checks to authenticated;

create policy "Owners and admins can see employer checks"
  on public.dq_employer_checks for select
  to authenticated
  using ((select public.can_manage_dq(organization_id)));

create policy "Owners and admins can log employer checks"
  on public.dq_employer_checks for insert
  to authenticated
  with check ((select public.can_manage_dq(organization_id)));

-- ---------------------------------------------------------- Audit log -----

-- Append-only: written only by the triggers below, readable by owners and
-- admins. actor_id has no foreign key, so the history outlives the user.
create table public.dq_audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  driver_id uuid,
  actor_id uuid,
  action text not null check (action in ('insert', 'update')),
  entity text not null,
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);

create index dq_audit_log_entity_idx on public.dq_audit_log (organization_id, entity, entity_id, at);
create index dq_audit_log_driver_idx on public.dq_audit_log (organization_id, driver_id, at);

alter table public.dq_audit_log enable row level security;

grant select on public.dq_audit_log to authenticated;

create policy "Owners and admins can read the DQ history"
  on public.dq_audit_log for select
  to authenticated
  using ((select public.can_manage_dq(organization_id)));

-- Columns never copied into the log.
create function public.dq_audit_scrub(row_data jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select row_data - array['ssn_ciphertext', 'date_of_birth_ciphertext'];
$$;

-- Logs an insert or update. For drivers, only changes to the DQ columns.
create function public.dq_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row jsonb := case when tg_op = 'UPDATE' then public.dq_audit_scrub(to_jsonb(old)) end;
  after_row jsonb := public.dq_audit_scrub(to_jsonb(new));
  dq_columns text[] := array[
    'license_class', 'cdl_state', 'prior_license_states', 'start_date', 'end_date',
    'holds_medical_variance', 'login_phone', 'user_id'
  ];
begin
  if tg_table_name = 'drivers' then
    if tg_op = 'UPDATE' then
      before_row := (select jsonb_object_agg(key, value) from jsonb_each(before_row) where key = any (dq_columns));
      after_row := (select jsonb_object_agg(key, value) from jsonb_each(after_row) where key = any (dq_columns));
      if before_row = after_row then
        return new;
      end if;
    else
      after_row := (select jsonb_object_agg(key, value) from jsonb_each(after_row) where key = any (dq_columns));
    end if;
  end if;

  insert into public.dq_audit_log (
    organization_id, driver_id, actor_id, action, entity, entity_id, before, after
  )
  values (
    new.organization_id,
    case when tg_table_name = 'drivers' then new.id else (to_jsonb(new) ->> 'driver_id')::uuid end,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    new.id,
    before_row,
    after_row
  );
  return new;
end;
$$;

revoke execute on function public.dq_audit() from public, anon, authenticated;

create trigger dq_audit after insert or update on public.dq_items
  for each row execute function public.dq_audit();
create trigger dq_audit after insert or update on public.dq_documents
  for each row execute function public.dq_audit();
create trigger dq_audit after insert or update on public.dq_attestations
  for each row execute function public.dq_audit();
create trigger dq_audit after insert or update on public.dq_employment_applications
  for each row execute function public.dq_audit();
create trigger dq_audit after insert or update on public.dq_employer_checks
  for each row execute function public.dq_audit();
create trigger dq_audit after insert or update on public.drivers
  for each row execute function public.dq_audit();

-- ------------------------------------------------------------ Storage -----

-- Private. Files at dq-files/<organization>/<driver>/<file type>/<file>.
-- Seen by whoever can see that file type; uploaded by owners and admins, or
-- by the driver into their own standard file. No update or delete policies:
-- files are never overwritten or removed, only superseded.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dq-files',
  'dq-files',
  false,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- Whether the caller may read (or, with for_upload, add) a dq-files path.
-- False for a malformed path rather than an error.
create function public.dq_path_allowed(path text, for_upload boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folders text[] := storage.foldername(path);
  uuid_pattern text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  org uuid;
  target_driver uuid;
  kind text;
begin
  if cardinality(folders) <> 3
    or folders[1] !~ uuid_pattern
    or folders[2] !~ uuid_pattern
    or folders[3] not in ('dq', 'investigation', 'drug_alcohol') then
    return false;
  end if;
  org := folders[1]::uuid;
  target_driver := folders[2]::uuid;
  kind := folders[3];

  if not exists (
    select 1 from public.drivers where organization_id = org and id = target_driver
  ) then
    return false;
  end if;

  if not for_upload then
    return public.can_view_dq(org, target_driver, kind);
  end if;
  if public.dq_file_frozen(target_driver) then
    return false;
  end if;
  return public.can_manage_dq(org)
    or (kind = 'dq' and public.is_dq_driver(org, target_driver));
end;
$$;

revoke execute on function public.dq_path_allowed(text, boolean) from public, anon;
grant execute on function public.dq_path_allowed(text, boolean) to authenticated;

create policy "People who can see a DQ file can read its files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'dq-files' and (select public.dq_path_allowed(name, false)));

create policy "Owners, admins and the driver can upload DQ files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'dq-files' and (select public.dq_path_allowed(name, true)));
