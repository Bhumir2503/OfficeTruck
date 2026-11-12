-- Trucks: an organization's power units. Any member can see them; owners and
-- admins add and update them. There is no delete policy: a truck that's sold
-- or returned is marked inactive, so its past loads and IFTA quarters stay
-- intact.

create table public.trucks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,

  -- What people call it, e.g. "Truck 12" or "112".
  unit_number text not null check (char_length(trim(unit_number)) between 1 and 30),
  -- 17 characters, no I, O or Q.
  vin text check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  year integer check (year between 1980 and 2100),
  make text check (char_length(make) <= 40),
  model text check (char_length(model) <= 40),

  plate_number text check (char_length(trim(plate_number)) between 1 and 15),
  plate_state text check (plate_state in (
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI',
    'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN',
    'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
    'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
    'WV', 'WI', 'WY', 'AS', 'GU', 'MP', 'PR', 'VI'
  )),

  -- Only active trucks are billed; out of service ones are parked for now.
  status text not null default 'active'
    check (status in ('active', 'out_of_service', 'inactive')),
  ownership text check (ownership in ('owned', 'leased', 'owner_operator')),
  -- Prefills the driver on new loads with this truck.
  default_driver_id uuid,

  -- The truck's id in Motive, so miles by state from the ELD land on it.
  motive_vehicle_id text check (char_length(trim(motive_vehicle_id)) between 1 and 50),

  -- Fixed costs per month in US dollars, spread over miles for cost per mile.
  monthly_payment numeric(10, 2) check (monthly_payment >= 0),
  monthly_insurance numeric(10, 2) check (monthly_insurance >= 0),
  monthly_other_costs numeric(10, 2) check (monthly_other_costs >= 0),

  -- Compliance dates. The annual inspection is stored as when it was last
  -- done (due a year later); the others as when they run out.
  annual_inspection_on date,
  registration_expires_on date,
  plate_expires_on date,

  notes text check (char_length(notes) <= 2000),

  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- For foreign keys that keep loads and filings inside one organization.
  unique (organization_id, id),
  -- The default driver must be in the same organization.
  constraint trucks_default_driver_fkey
    foreign key (organization_id, default_driver_id)
    references public.drivers (organization_id, id)
);

-- Unit numbers, VINs and Motive ids each name one truck per organization, so
-- ELD and CSV rows can be matched to it. Unit numbers ignore case.
create unique index trucks_organization_unit_idx
  on public.trucks (organization_id, lower(trim(unit_number)));
create unique index trucks_organization_vin_idx
  on public.trucks (organization_id, vin) where vin is not null;
create unique index trucks_organization_motive_idx
  on public.trucks (organization_id, motive_vehicle_id)
  where motive_vehicle_id is not null;

-- Keeps updated_at current, and stops an update from moving a truck to
-- another organization or rewriting who added it.
create function public.trucks_before_update()
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

create trigger trucks_before_update
  before update on public.trucks
  for each row execute function public.trucks_before_update();

alter table public.trucks enable row level security;

grant select, insert, update on public.trucks to authenticated;

create policy "Members can view their organization's trucks"
  on public.trucks for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Owners and admins can add trucks"
  on public.trucks for insert
  to authenticated
  with check (
    (select public.organization_role(organization_id)) in ('owner', 'admin')
    and created_by = (select auth.uid())
  );

create policy "Owners and admins can update trucks"
  on public.trucks for update
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'))
  with check ((select public.organization_role(organization_id)) in ('owner', 'admin'));

-- Loads: which truck ran it, and the empty (deadhead) miles to get there.
-- Cost per mile counts both, until ELD miles replace them.
alter table public.loads
  add column truck_id uuid,
  add column empty_miles integer check (empty_miles between 0 and 100000),
  add constraint loads_truck_fkey
    foreign key (organization_id, truck_id)
    references public.trucks (organization_id, id);

-- A truck's load history, newest pickup first.
create index loads_truck_pickup_idx
  on public.loads (truck_id, pickup_start desc)
  where truck_id is not null;

-- Form 2290, the heavy vehicle use tax. The company files one return per
-- tax year (July 1 to June 30), due by August 31, listing the trucks it
-- covers by VIN. tax_year is the year the period starts: 2026 is
-- July 2026 to June 2027.
create table public.heavy_vehicle_tax_filings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  tax_year integer not null check (tax_year between 2000 and 2100),
  filed_on date not null,
  notes text check (char_length(notes) <= 2000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, tax_year),
  unique (organization_id, id)
);

create table public.heavy_vehicle_tax_filing_trucks (
  organization_id uuid not null,
  filing_id uuid not null,
  truck_id uuid not null,
  primary key (filing_id, truck_id),
  foreign key (organization_id, filing_id)
    references public.heavy_vehicle_tax_filings (organization_id, id) on delete cascade,
  foreign key (organization_id, truck_id)
    references public.trucks (organization_id, id)
);

-- "Which filings cover this truck?"
create index heavy_vehicle_tax_filing_trucks_truck_idx
  on public.heavy_vehicle_tax_filing_trucks (truck_id);

create function public.heavy_vehicle_tax_filings_before_update()
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

create trigger heavy_vehicle_tax_filings_before_update
  before update on public.heavy_vehicle_tax_filings
  for each row execute function public.heavy_vehicle_tax_filings_before_update();

alter table public.heavy_vehicle_tax_filings enable row level security;
alter table public.heavy_vehicle_tax_filing_trucks enable row level security;

-- No delete on filings, like drivers and trucks. Covered trucks can be
-- added and taken off a filing.
grant select, insert, update on public.heavy_vehicle_tax_filings to authenticated;
grant select, insert, delete on public.heavy_vehicle_tax_filing_trucks to authenticated;

create policy "Members can view their organization's 2290 filings"
  on public.heavy_vehicle_tax_filings for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Owners and admins can add 2290 filings"
  on public.heavy_vehicle_tax_filings for insert
  to authenticated
  with check (
    (select public.organization_role(organization_id)) in ('owner', 'admin')
    and created_by = (select auth.uid())
  );

create policy "Owners and admins can update 2290 filings"
  on public.heavy_vehicle_tax_filings for update
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'))
  with check ((select public.organization_role(organization_id)) in ('owner', 'admin'));

create policy "Members can view which trucks a 2290 covers"
  on public.heavy_vehicle_tax_filing_trucks for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Owners and admins can add trucks to a 2290"
  on public.heavy_vehicle_tax_filing_trucks for insert
  to authenticated
  with check ((select public.organization_role(organization_id)) in ('owner', 'admin'));

create policy "Owners and admins can take trucks off a 2290"
  on public.heavy_vehicle_tax_filing_trucks for delete
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));
