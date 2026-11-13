-- Brokers. A broker record tells the invoice where to go, whether the
-- broker is safe to haul for, and (once invoices exist) how fast they pay.
--
-- FMCSA data is public and the same for every customer, so it lives in one
-- shared table keyed by MC number, with no organization. Everything else
-- (contacts, terms, factoring, notes) is per organization.

-- ------------------------------------------------------------ FMCSA -----

create table public.fmcsa_records (
  -- Digits only, without the "MC" prefix.
  mc_number text primary key check (mc_number ~ '^[0-9]{1,8}$'),
  dot_number text check (dot_number ~ '^[0-9]{1,8}$'),
  legal_name text,
  dba_name text,
  phone text,
  street text,
  city text,
  state text,
  postal_code text,
  -- FMCSA's allowed-to-operate flag.
  allowed_to_operate boolean,
  -- Broker operating authority, and the broker bond (BMC-84/85). Null when
  -- FMCSA's response didn't say.
  broker_authority_active boolean,
  bond_on_file boolean,
  authority_granted_on date,
  -- Set by the trigger below when a check finds a different name, address
  -- or phone than the one before it.
  name_changed_on date,
  address_changed_on date,
  phone_changed_on date,
  authority_changed_on date,
  -- When this was first and last checked, and exactly what FMCSA returned.
  first_checked_at timestamptz not null default now(),
  checked_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb
);

-- Notes the day a name, address, phone or authority status changes from
-- one check to the next, so the app can flag recent changes.
create function public.fmcsa_records_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.first_checked_at := old.first_checked_at;
  if (new.legal_name, new.dba_name) is distinct from (old.legal_name, old.dba_name) then
    new.name_changed_on := current_date;
  end if;
  if (new.street, new.city, new.state, new.postal_code)
     is distinct from (old.street, old.city, old.state, old.postal_code) then
    new.address_changed_on := current_date;
  end if;
  if new.phone is distinct from old.phone then
    new.phone_changed_on := current_date;
  end if;
  if new.broker_authority_active is distinct from old.broker_authority_active
     or new.authority_granted_on is distinct from old.authority_granted_on then
    new.authority_changed_on := current_date;
  end if;
  return new;
end;
$$;

create trigger fmcsa_records_before_update
  before update on public.fmcsa_records
  for each row execute function public.fmcsa_records_before_update();

alter table public.fmcsa_records enable row level security;

-- Anyone signed in can read it. Only the server writes it, with the secret
-- key (which bypasses row-level security), so no customer can change
-- another customer's view of a broker.
grant select on public.fmcsa_records to authenticated;

create policy "Signed-in users can read FMCSA records"
  on public.fmcsa_records for select
  to authenticated
  using (true);

-- ----------------------------------------------------------- Brokers -----

create table public.brokers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,

  legal_name text not null check (char_length(trim(legal_name)) between 1 and 200),
  dba_name text check (char_length(dba_name) <= 200),
  -- Digits only. Unique per organization, and how brokers are looked up.
  mc_number text check (mc_number ~ '^[0-9]{1,8}$'),
  dot_number text check (dot_number ~ '^[0-9]{1,8}$'),

  -- Mailing address, where paper goes.
  address_line1 text check (char_length(address_line1) <= 200),
  address_line2 text check (char_length(address_line2) <= 200),
  city text check (char_length(city) <= 100),
  state text check (state in (
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI',
    'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN',
    'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
    'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
    'WV', 'WI', 'WY', 'AS', 'GU', 'MP', 'PR', 'VI'
  )),
  postal_code text check (postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'),

  -- Domains the broker's people email from, e.g. {tql.com}. Rate cons from
  -- anywhere else get an impersonation warning.
  email_domains text[] not null default '{}'
    check (cardinality(email_domains) <= 20),

  -- Where invoice packets go. "portal" means the broker wants them uploaded
  -- to their own site, by hand: the app never claims to have sent those.
  invoice_method text not null default 'email'
    check (invoice_method in ('email', 'portal')),
  billing_emails text[] not null default '{}'
    check (cardinality(billing_emails) <= 10),
  portal_url text check (char_length(portal_url) <= 500),
  payment_terms_days integer not null default 30
    check (payment_terms_days between 0 and 365),
  quick_pay_fee_percent numeric(5, 2)
    check (quick_pay_fee_percent between 0 and 100),
  -- Whether this carrier factors this broker's loads. If so, packets go to
  -- the factoring company, and the notice of assignment should be on file.
  factored boolean not null default false,
  noa_on_file boolean not null default false,

  do_not_use boolean not null default false,
  do_not_use_reason text check (char_length(do_not_use_reason) <= 500),
  notes text check (char_length(notes) <= 2000),

  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, id)
);

create unique index brokers_organization_mc_idx
  on public.brokers (organization_id, mc_number) where mc_number is not null;
create index brokers_organization_name_idx
  on public.brokers (organization_id, lower(legal_name));

create function public.brokers_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.organization_id := old.organization_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger brokers_before_update
  before update on public.brokers
  for each row execute function public.brokers_before_update();

alter table public.brokers enable row level security;

-- Like loads: anyone in the organization books with brokers, so any member
-- can add and update them. No delete: mark a broker "do not use" instead,
-- so past loads keep their broker.
grant select, insert, update on public.brokers to authenticated;

create policy "Members can view their organization's brokers"
  on public.brokers for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Members can add brokers"
  on public.brokers for insert
  to authenticated
  with check (
    (select public.is_organization_member(organization_id))
    and created_by = (select auth.uid())
  );

create policy "Members can update their organization's brokers"
  on public.brokers for update
  to authenticated
  using ((select public.is_organization_member(organization_id)))
  with check ((select public.is_organization_member(organization_id)));

-- ---------------------------------------------------------- Contacts -----

create table public.broker_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  broker_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  role text not null check (role in ('dispatch', 'billing', 'accounting')),
  email text check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 30),
  created_at timestamptz not null default now(),
  foreign key (organization_id, broker_id)
    references public.brokers (organization_id, id) on delete cascade
);

create index broker_contacts_broker_idx on public.broker_contacts (broker_id);

alter table public.broker_contacts enable row level security;

-- People move on, so contacts can be removed.
grant select, insert, update, delete on public.broker_contacts to authenticated;

create policy "Members can view broker contacts"
  on public.broker_contacts for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Members can add broker contacts"
  on public.broker_contacts for insert
  to authenticated
  with check ((select public.is_organization_member(organization_id)));

create policy "Members can update broker contacts"
  on public.broker_contacts for update
  to authenticated
  using ((select public.is_organization_member(organization_id)))
  with check ((select public.is_organization_member(organization_id)));

create policy "Members can remove broker contacts"
  on public.broker_contacts for delete
  to authenticated
  using ((select public.is_organization_member(organization_id)));

-- ------------------------------------------------------------- Loads -----

-- The broker on a load, and who sent the rate con, for the impersonation
-- check. broker_name stays: it's what the rate con said, and it's shown for
-- loads booked before brokers existed.
alter table public.loads
  add column broker_id uuid,
  add column rate_con_from text check (char_length(rate_con_from) <= 254),
  add constraint loads_broker_fkey
    foreign key (organization_id, broker_id)
    references public.brokers (organization_id, id);

create index loads_broker_idx
  on public.loads (broker_id, pickup_start desc)
  where broker_id is not null;
