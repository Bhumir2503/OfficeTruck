-- Trailers: an organization's trailers, with the same compliance dates as
-- trucks and the truck pulling each one. Any member can see them; owners
-- and admins add, update and delete them.

create table public.trailers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,

  -- What people call it, e.g. "T-104".
  unit_number text not null check (char_length(trim(unit_number)) between 1 and 30),
  trailer_type text check (trailer_type in (
    'dry_van', 'reefer', 'flatbed', 'step_deck', 'tanker', 'other'
  )),
  length_ft smallint check (length_ft between 10 and 60),
  vin text check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  year integer check (year between 1950 and 2100),
  make text check (char_length(make) <= 40),

  plate_number text check (char_length(trim(plate_number)) between 1 and 15),
  plate_state text check (plate_state in (
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI',
    'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN',
    'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
    'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
    'WV', 'WI', 'WY', 'AS', 'GU', 'MP', 'PR', 'VI'
  )),

  status text not null default 'active'
    check (status in ('active', 'out_of_service', 'inactive')),
  ownership text check (ownership in ('owned', 'leased', 'owner_operator')),
  -- The truck pulling it now, if any.
  truck_id uuid,

  -- As on trucks: the inspection as when it was last done (due a year
  -- later); the others as when they run out.
  annual_inspection_on date,
  registration_expires_on date,
  plate_expires_on date,

  notes text check (char_length(notes) <= 2000),

  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, id),
  -- The truck must be in the same organization. Deleting it unhooks the
  -- trailer rather than deleting it.
  constraint trailers_truck_fkey
    foreign key (organization_id, truck_id)
    references public.trucks (organization_id, id) on delete set null (truck_id)
);

create unique index trailers_organization_unit_idx
  on public.trailers (organization_id, lower(trim(unit_number)));
create unique index trailers_organization_vin_idx
  on public.trailers (organization_id, vin) where vin is not null;
create index trailers_truck_idx
  on public.trailers (truck_id) where truck_id is not null;

-- Same columns as trucks, so the same guard: keeps updated_at current and
-- stops an update from moving a trailer to another organization.
create trigger trailers_before_update
  before update on public.trailers
  for each row execute function public.trucks_before_update();

alter table public.trailers enable row level security;

revoke all on public.trailers from authenticated, anon;
grant select, insert, update, delete on public.trailers to authenticated;

create policy "Members can view their organization's trailers"
  on public.trailers for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Owners and admins can add trailers"
  on public.trailers for insert
  to authenticated
  with check (
    (select public.organization_role(organization_id)) in ('owner', 'admin')
    and created_by = (select auth.uid())
  );

create policy "Owners and admins can update trailers"
  on public.trailers for update
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'))
  with check ((select public.organization_role(organization_id)) in ('owner', 'admin'));

create policy "Owners and admins can delete trailers"
  on public.trailers for delete
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));
