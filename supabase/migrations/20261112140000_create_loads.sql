-- Loads: one shipment, from booking to invoiced. Any member of the
-- organization can see, add and update its loads. There is no delete policy:
-- a load that falls through is marked cancelled instead, so it stays on record.
--
-- Broker, driver and truck are plain text until Brokers, Drivers and
-- Equipment exist; they'll become references to those tables then.

create table public.loads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- The load or reference number, usually from the rate confirmation.
  reference text not null check (char_length(trim(reference)) between 1 and 50),
  broker_name text not null check (char_length(trim(broker_name)) between 1 and 120),

  -- Stop times are the wall-clock time at the stop, as written on the rate
  -- confirmation, so they're stored without a time zone. A window has an
  -- optional end; with no end it's a single appointment time.
  pickup_location text not null check (char_length(trim(pickup_location)) between 1 and 200),
  pickup_start timestamp not null,
  pickup_end timestamp check (pickup_end >= pickup_start),
  delivery_location text not null check (char_length(trim(delivery_location)) between 1 and 200),
  delivery_start timestamp not null check (delivery_start >= pickup_start),
  delivery_end timestamp check (delivery_end >= delivery_start),

  -- US dollars.
  rate numeric(10, 2) not null check (rate >= 0),
  status text not null default 'booked'
    check (status in ('booked', 'in_transit', 'delivered', 'invoiced', 'cancelled')),
  driver_name text check (char_length(driver_name) <= 120),
  truck text check (char_length(truck) <= 50),
  notes text check (char_length(notes) <= 2000),

  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reference numbers are unique per organization, ignoring case.
create unique index loads_organization_reference_idx
  on public.loads (organization_id, lower(reference));

-- The list: an organization's loads, newest pickup first.
create index loads_organization_pickup_idx
  on public.loads (organization_id, pickup_start desc);

-- Keeps updated_at current, and stops an update from moving a load to another
-- organization or rewriting who created it.
create function public.loads_before_update()
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

create trigger loads_before_update
  before update on public.loads
  for each row execute function public.loads_before_update();

alter table public.loads enable row level security;

grant select, insert, update on public.loads to authenticated;

create policy "Members can view their organization's loads"
  on public.loads for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Members can add loads to their organization"
  on public.loads for insert
  to authenticated
  with check (
    (select public.is_organization_member(organization_id))
    and created_by = (select auth.uid())
  );

create policy "Members can update their organization's loads"
  on public.loads for update
  to authenticated
  using ((select public.is_organization_member(organization_id)))
  with check ((select public.is_organization_member(organization_id)));
