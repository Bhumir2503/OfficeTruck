-- Trucks: weight and axles (which decide whether the 2290 and IRP apply),
-- an odometer reading for maintenance reminders, why a truck is out of
-- service and until when, and a maintenance log. Also lets owners and admins
-- delete a truck added by mistake, and drops the unused Motive link.

alter table public.trucks
  -- Registered (taxable) gross weight. The 2290 applies at 55,000 lbs and up.
  add column registered_weight_lbs integer
    check (registered_weight_lbs between 1000 and 200000),
  add column axles smallint check (axles between 2 and 9),
  -- The last odometer reading and the day it was read.
  add column odometer integer check (odometer between 0 and 5000000),
  add column odometer_on date,
  -- Preventive maintenance every so many miles and/or days.
  add column pm_interval_miles integer check (pm_interval_miles between 1000 and 100000),
  add column pm_interval_days integer check (pm_interval_days between 7 and 730),
  -- While out of service: why, and when it's expected back.
  add column out_of_service_reason text
    check (char_length(trim(out_of_service_reason)) between 1 and 200),
  add column out_of_service_until date;

-- The ELD integration was taken out of the app; nothing reads this anymore.
drop index if exists public.trucks_organization_motive_idx;
alter table public.trucks drop column if exists motive_vehicle_id;

-- Deleting a truck. Loads and 2290 filings point at trucks without a
-- cascade, so the database refuses to delete one that has either; those are
-- marked inactive instead. Its documents and maintenance go with it.
grant delete on public.trucks to authenticated;

create policy "Owners and admins can delete trucks"
  on public.trucks for delete
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));

-- Each service, repair or inspection on a truck: the record the FMCSA asks a
-- carrier to keep for every vehicle (49 CFR 396.3).
create table public.truck_maintenance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  truck_id uuid not null,
  done_on date not null,
  kind text not null check (kind in (
    'preventive', 'repair', 'inspection', 'tires', 'other'
  )),
  description text not null check (char_length(trim(description)) between 1 and 500),
  odometer integer check (odometer between 0 and 5000000),
  cost numeric(10, 2) check (cost >= 0),
  -- The shop or mechanic.
  vendor text check (char_length(trim(vendor)) between 1 and 120),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint truck_maintenance_truck_fkey
    foreign key (organization_id, truck_id)
    references public.trucks (organization_id, id) on delete cascade
);

create index truck_maintenance_truck_idx
  on public.truck_maintenance (organization_id, truck_id, done_on desc);

alter table public.truck_maintenance enable row level security;

-- Entries are added and removed, not edited. Supabase grants signed-in users
-- everything on new tables by default, so take that away first.
revoke all on public.truck_maintenance from authenticated, anon;
grant select, insert, delete on public.truck_maintenance to authenticated;

create policy "Members can view truck maintenance"
  on public.truck_maintenance for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Owners and admins can add truck maintenance"
  on public.truck_maintenance for insert
  to authenticated
  with check (
    (select public.organization_role(organization_id)) in ('owner', 'admin')
    and created_by = (select auth.uid())
  );

create policy "Owners and admins can remove truck maintenance"
  on public.truck_maintenance for delete
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));
