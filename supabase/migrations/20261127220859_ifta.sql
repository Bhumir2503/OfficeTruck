-- IFTA, the quarterly fuel tax report. Each quarter a carrier reports, for
-- every IFTA jurisdiction (the lower 48 states and 10 Canadian provinces),
-- the miles its trucks drove there and the fuel they bought there. The
-- state's portal applies that quarter's tax rates.
--
-- Miles by state are entered by hand for now; an ELD sync will fill the same
-- table later (source 'eld'), as docs/eld-integration.md describes. Fuel
-- purchases are kept apart from load expenses: IFTA needs gallons and the
-- state, and fuel is bought between loads too.
--
-- Office only: drivers reach nothing here.

-- Keep in step with IFTA_JURISDICTIONS in web/lib/ifta-format.ts.
create function public.is_ifta_jurisdiction(code text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select code in (
    'AL', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'ID', 'IL', 'IN',
    'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT',
    'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
    'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'ON', 'PE', 'QC', 'SK'
  )
$$;

-- ---------------------------------------------------------------- Miles ---

-- One truck's miles in one jurisdiction in one quarter.
create table public.ifta_state_miles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  truck_id uuid not null,
  year integer not null check (year between 2000 and 2100),
  quarter integer not null check (quarter between 1 and 4),
  jurisdiction text not null check (public.is_ifta_jurisdiction(jurisdiction)),
  miles integer not null check (miles between 1 and 1000000),
  source text not null default 'manual' check (source in ('manual', 'eld')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ifta_state_miles_truck_fkey
    foreign key (organization_id, truck_id)
    references public.trucks (organization_id, id) on delete cascade,
  constraint ifta_state_miles_one_per_state
    unique (organization_id, truck_id, year, quarter, jurisdiction)
);

create index ifta_state_miles_quarter_idx
  on public.ifta_state_miles (organization_id, year, quarter);

-- Only the miles change; a row entered for the wrong truck or state is
-- removed and entered again.
create function public.ifta_state_miles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.organization_id := old.organization_id;
  new.truck_id := old.truck_id;
  new.year := old.year;
  new.quarter := old.quarter;
  new.jurisdiction := old.jurisdiction;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger ifta_state_miles_before_update
  before update on public.ifta_state_miles
  for each row execute function public.ifta_state_miles_before_update();

alter table public.ifta_state_miles enable row level security;

-- Supabase grants signed-in users everything on new tables by default.
revoke all on public.ifta_state_miles from authenticated, anon;
grant select, insert, delete on public.ifta_state_miles to authenticated;
grant update (miles, source) on public.ifta_state_miles to authenticated;

create policy "Members can view IFTA miles"
  on public.ifta_state_miles for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Owners and admins can add IFTA miles"
  on public.ifta_state_miles for insert
  to authenticated
  with check (
    (select public.organization_role(organization_id)) in ('owner', 'admin')
    and created_by = (select auth.uid())
  );

create policy "Owners and admins can change IFTA miles"
  on public.ifta_state_miles for update
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'))
  with check ((select public.organization_role(organization_id)) in ('owner', 'admin'));

create policy "Owners and admins can remove IFTA miles"
  on public.ifta_state_miles for delete
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));

-- ----------------------------------------------------------------- Fuel ---

-- One fuel purchase for one truck: where, when and how many gallons.
create table public.ifta_fuel_purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  truck_id uuid not null,
  purchased_on date not null,
  jurisdiction text not null check (public.is_ifta_jurisdiction(jurisdiction)),
  gallons numeric(9, 3) not null check (gallons > 0 and gallons <= 10000),
  amount numeric(10, 2) check (amount >= 0 and amount <= 99999999.99),
  -- The truck stop or fuel card, e.g. "Pilot #412, Amarillo".
  vendor text check (char_length(trim(vendor)) between 1 and 120),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ifta_fuel_purchases_truck_fkey
    foreign key (organization_id, truck_id)
    references public.trucks (organization_id, id) on delete cascade
);

create index ifta_fuel_purchases_date_idx
  on public.ifta_fuel_purchases (organization_id, purchased_on);

alter table public.ifta_fuel_purchases enable row level security;

-- Purchases are added and removed, not edited.
revoke all on public.ifta_fuel_purchases from authenticated, anon;
grant select, insert, delete on public.ifta_fuel_purchases to authenticated;

create policy "Members can view IFTA fuel purchases"
  on public.ifta_fuel_purchases for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Owners and admins can add IFTA fuel purchases"
  on public.ifta_fuel_purchases for insert
  to authenticated
  with check (
    (select public.organization_role(organization_id)) in ('owner', 'admin')
    and created_by = (select auth.uid())
  );

create policy "Owners and admins can remove IFTA fuel purchases"
  on public.ifta_fuel_purchases for delete
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));

-- -------------------------------------------------------------- Filings ---

-- A quarter's return, once it's filed with the base state.
create table public.ifta_filings (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  quarter integer not null check (quarter between 1 and 4),
  filed_on date not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, year, quarter)
);

alter table public.ifta_filings enable row level security;

-- Marked filed, or unmarked by deleting the row.
revoke all on public.ifta_filings from authenticated, anon;
grant select, insert, delete on public.ifta_filings to authenticated;

create policy "Members can view IFTA filings"
  on public.ifta_filings for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Owners and admins can mark IFTA filed"
  on public.ifta_filings for insert
  to authenticated
  with check (
    (select public.organization_role(organization_id)) in ('owner', 'admin')
    and created_by = (select auth.uid())
  );

create policy "Owners and admins can unmark IFTA filed"
  on public.ifta_filings for delete
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));
