-- Loads, part 2: what's being hauled, any number of stops, charges split into
-- lines, rate con versions, and the full status flow.
--
--   * Freight details: reference numbers, equipment, commodity, weight and
--     trailer number.
--   * load_stops: pickups and deliveries in order. The driver taps arrived and
--     departed at each one; those server-side times are the detention proof.
--     loads.pickup_* and loads.delivery_* stay as a summary (first pickup,
--     last delivery) kept in step by a trigger, so lists and history pages
--     keep working unchanged.
--   * load_charges: linehaul, fuel surcharge and accessorials as lines.
--     loads.rate becomes their total, kept in step by a trigger.
--   * load_rate_versions: every set of rate con charges, in order. A person
--     typing one in applies it straight away; one read from a rate con by the
--     app (later) waits as pending until a person approves it. Only these
--     functions write rate con lines, so no amount changes without a person.
--   * Status: booked → dispatched → loaded → delivered → invoiced → paid or
--     factored, plus cancelled and tonu.

-- ----------------------------------------------------------- Status -----

alter table public.loads drop constraint loads_status_check;

-- "In transit" was picked up and on the road: that's loaded now.
update public.loads set status = 'loaded' where status = 'in_transit';

alter table public.loads
  add constraint loads_status_check check (status in (
    'booked', 'dispatched', 'loaded', 'delivered', 'invoiced', 'paid',
    'factored', 'cancelled', 'tonu'
  ));

-- --------------------------------------------------- Freight details -----

alter table public.loads
  -- PO, order or other numbers the shipper or receiver goes by.
  add column reference_numbers text check (char_length(reference_numbers) <= 200),
  add column equipment text check (equipment in (
    'dry_van', 'reefer', 'flatbed', 'step_deck', 'conestoga', 'power_only', 'other'
  )),
  add column commodity text check (char_length(commodity) <= 120),
  add column weight_lbs integer check (weight_lbs between 0 and 200000),
  add column trailer_number text check (char_length(trailer_number) <= 30),
  -- Detention terms from the rate con: hours free at each stop, then this
  -- much per hour. Both or neither.
  add column detention_free_hours numeric(4, 1)
    check (detention_free_hours between 0 and 48),
  add column detention_rate numeric(8, 2) check (detention_rate >= 0),
  add constraint loads_detention_terms_set
    check ((detention_free_hours is null) = (detention_rate is null)),
  add constraint loads_organization_id_id_key unique (organization_id, id);

-- Stops can now be edited one at a time, so the summary can briefly be out of
-- order mid-edit. The stop editor checks the order instead.
-- Postgres named it (loads_check1 when it was created), so it's found by
-- what it checks.
do $$
declare
  found_name text;
begin
  select conname into found_name
  from pg_constraint
  where conrelid = 'public.loads'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) = 'CHECK ((delivery_start >= pickup_start))';
  if found_name is not null then
    execute format('alter table public.loads drop constraint %I', found_name);
  end if;
end;
$$;

-- ------------------------------------------------------------- Stops -----

create table public.load_stops (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  load_id uuid not null,
  -- 1, 2, 3… in the order they're run.
  position smallint not null check (position between 1 and 50),
  kind text not null check (kind in ('pickup', 'delivery')),
  location text not null check (char_length(trim(location)) between 1 and 200),
  -- Wall-clock time at the stop, like the summary columns on loads.
  appointment_start timestamp not null,
  appointment_end timestamp check (appointment_end >= appointment_start),
  -- The pickup or delivery number the shipper or receiver asks for.
  stop_number text check (char_length(stop_number) <= 50),
  notes text check (char_length(notes) <= 500),

  -- Server time when the driver tapped arrived and departed.
  arrived_at timestamptz,
  arrived_by uuid references auth.users (id) on delete set null,
  departed_at timestamptz,
  departed_by uuid references auth.users (id) on delete set null,
  constraint load_stops_departed_after_arrived
    check (departed_at is null or (arrived_at is not null and departed_at >= arrived_at)),

  created_at timestamptz not null default now(),

  foreign key (organization_id, load_id)
    references public.loads (organization_id, id) on delete cascade,
  -- Deferred, so stops can be reordered in one statement.
  constraint load_stops_position_key unique (load_id, position)
    deferrable initially deferred
);

alter table public.load_stops enable row level security;

-- Stops are added, changed and reordered through save_load_stops, and timed
-- through record_stop_event, so members only read them directly.
grant select on public.load_stops to authenticated;

create policy "Members can view their organization's stops"
  on public.load_stops for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

-- Copies the first pickup and last delivery onto the load.
create function public.sync_load_stop_summary(target_load uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  first_pickup public.load_stops;
  last_delivery public.load_stops;
begin
  select * into first_pickup
  from public.load_stops
  where load_id = target_load and kind = 'pickup'
  order by position
  limit 1;

  select * into last_delivery
  from public.load_stops
  where load_id = target_load and kind = 'delivery'
  order by position desc
  limit 1;

  -- Mid-edit there may be no pickup or delivery yet; keep what's there.
  update public.loads
  set pickup_location = coalesce(first_pickup.location, pickup_location),
      pickup_start = coalesce(first_pickup.appointment_start, pickup_start),
      pickup_end = case when first_pickup.id is null then pickup_end
                        else first_pickup.appointment_end end,
      delivery_location = coalesce(last_delivery.location, delivery_location),
      delivery_start = coalesce(last_delivery.appointment_start, delivery_start),
      delivery_end = case when last_delivery.id is null then delivery_end
                          else last_delivery.appointment_end end
  where id = target_load
    and (first_pickup.id is not null or last_delivery.id is not null);
end;
$$;

revoke execute on function public.sync_load_stop_summary(uuid) from public, anon, authenticated;

create function public.load_stops_after_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_load_stop_summary(old.load_id);
    return old;
  end if;
  perform public.sync_load_stop_summary(new.load_id);
  return new;
end;
$$;

create trigger load_stops_after_change
  after insert or update or delete on public.load_stops
  for each row execute function public.load_stops_after_change();

-- Every load booked so far had one pickup and one delivery.
insert into public.load_stops
  (organization_id, load_id, position, kind, location, appointment_start, appointment_end)
select organization_id, id, 1, 'pickup', pickup_location, pickup_start, pickup_end
from public.loads;

insert into public.load_stops
  (organization_id, load_id, position, kind, location, appointment_start, appointment_end)
select organization_id, id, 2, 'delivery', delivery_location, delivery_start, delivery_end
from public.loads;

-- ----------------------------------------------------------- Charges -----

create table public.load_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  load_id uuid not null,
  kind text not null check (kind in (
    'linehaul', 'fuel_surcharge', 'detention', 'lumper', 'tonu', 'layover',
    'stop_off', 'other'
  )),
  description text check (char_length(description) <= 120),
  amount numeric(10, 2) not null check (amount between 0 and 99999999.99),
  -- rate_con: agreed on the rate con, changed only by a new version.
  -- accessorial: run up on the road (detention, lumper…), added by a person.
  source text not null check (source in ('rate_con', 'accessorial')),
  position smallint not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, load_id)
    references public.loads (organization_id, id) on delete cascade
);

create index load_charges_load_idx on public.load_charges (load_id, source, position);

alter table public.load_charges enable row level security;

grant select, insert, update, delete on public.load_charges to authenticated;

create policy "Members can view their organization's charges"
  on public.load_charges for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

-- Rate con lines are written only by the version functions below.
create policy "Members can add accessorials"
  on public.load_charges for insert
  to authenticated
  with check (
    (select public.is_organization_member(organization_id))
    and source = 'accessorial'
    and created_by = (select auth.uid())
  );

create policy "Members can change accessorials"
  on public.load_charges for update
  to authenticated
  using ((select public.is_organization_member(organization_id)) and source = 'accessorial')
  with check ((select public.is_organization_member(organization_id)) and source = 'accessorial');

create policy "Members can remove accessorials"
  on public.load_charges for delete
  to authenticated
  using ((select public.is_organization_member(organization_id)) and source = 'accessorial');

-- An update can't move a charge to another load or turn it into a rate con line.
create function public.load_charges_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.organization_id := old.organization_id;
  new.load_id := old.load_id;
  new.source := old.source;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger load_charges_before_update
  before update on public.load_charges
  for each row execute function public.load_charges_before_update();

-- loads.rate is the total of the load's charges.
create function public.load_charges_after_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target uuid := case when tg_op = 'DELETE' then old.load_id else new.load_id end;
begin
  perform set_config('officetruck.sync_rate', 'on', true);
  update public.loads
  set rate = coalesce(
    (select sum(amount) from public.load_charges where load_id = target), 0)
  where id = target;
  perform set_config('officetruck.sync_rate', 'off', true);
  return null;
end;
$$;

create trigger load_charges_after_change
  after insert or update or delete on public.load_charges
  for each row execute function public.load_charges_after_change();

-- ---------------------------------------------------- Rate versions -----

create table public.load_rate_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  load_id uuid not null,
  version integer not null check (version >= 1),
  status text not null check (status in ('pending', 'approved', 'rejected')),
  -- manual: typed in by a person. rate_con: read from a rate con by the app.
  source text not null default 'manual' check (source in ('manual', 'rate_con')),
  -- [{ "kind": "linehaul", "description": null, "amount": 2450.00 }, …]
  charges jsonb not null check (jsonb_typeof(charges) = 'array'),
  total numeric(10, 2) not null,
  detention_free_hours numeric(4, 1),
  detention_rate numeric(8, 2),
  note text check (char_length(note) <= 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  unique (load_id, version),
  foreign key (organization_id, load_id)
    references public.loads (organization_id, id) on delete cascade
);

-- At most one version waiting for review per load.
create unique index load_rate_versions_one_pending_idx
  on public.load_rate_versions (load_id) where status = 'pending';

alter table public.load_rate_versions enable row level security;

grant select on public.load_rate_versions to authenticated;

create policy "Members can view their organization's rate versions"
  on public.load_rate_versions for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

-- Every load booked so far: its rate becomes a linehaul line, as version 1.
insert into public.load_charges
  (organization_id, load_id, kind, amount, source, position, created_by, created_at)
select organization_id, id, 'linehaul', rate, 'rate_con', 1, created_by, created_at
from public.loads;

insert into public.load_rate_versions
  (organization_id, load_id, version, status, source, charges, total,
   created_by, created_at, reviewed_by, reviewed_at)
select organization_id, id, 1, 'approved', 'manual',
       jsonb_build_array(jsonb_build_object('kind', 'linehaul', 'description', null, 'amount', rate)),
       rate, created_by, created_at, created_by, created_at
from public.loads;

-- --------------------------------------------------------- Functions -----

-- The rate and detention terms follow the charges and the approved rate
-- version, so a direct update can't change them. The functions here set a
-- flag for their own transaction to get past this.
create or replace function public.loads_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.organization_id := old.organization_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  if coalesce(current_setting('officetruck.sync_rate', true), '') <> 'on' then
    new.rate := old.rate;
    new.detention_free_hours := old.detention_free_hours;
    new.detention_rate := old.detention_rate;
  end if;
  return new;
end;
$$;

-- Checks a charges array and returns its total. Raises with a hint the app
-- turns into a message.
create function public.load_charges_total(lines jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  line jsonb;
  total numeric := 0;
begin
  if jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) = 0 then
    raise exception 'Add at least one charge.' using errcode = '22023', hint = 'no_charges';
  end if;
  if jsonb_array_length(lines) > 20 then
    raise exception 'A load can have at most 20 charges.' using errcode = '22023', hint = 'too_many';
  end if;
  for line in select * from jsonb_array_elements(lines) loop
    if (line->>'amount')::numeric < 0 then
      raise exception 'Charges can''t be negative.' using errcode = '22023', hint = 'negative';
    end if;
    total := total + (line->>'amount')::numeric;
  end loop;
  return total;
end;
$$;

-- Replaces a load's rate con lines and detention terms with a version's.
create function public.apply_load_rate_version(target_version uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.load_rate_versions;
begin
  select * into v from public.load_rate_versions where id = target_version;

  delete from public.load_charges
  where load_id = v.load_id and source = 'rate_con';

  insert into public.load_charges
    (organization_id, load_id, kind, description, amount, source, position, created_by)
  select v.organization_id, v.load_id, line->>'kind',
         nullif(trim(line->>'description'), ''),
         (line->>'amount')::numeric, 'rate_con', ordinality::smallint, v.created_by
  from jsonb_array_elements(v.charges) with ordinality as t(line, ordinality);

  perform set_config('officetruck.sync_rate', 'on', true);
  update public.loads
  set detention_free_hours = v.detention_free_hours,
      detention_rate = v.detention_rate
  where id = v.load_id;
  perform set_config('officetruck.sync_rate', 'off', true);
end;
$$;

revoke execute on function public.apply_load_rate_version(uuid) from public, anon, authenticated;

-- Adds or replaces a load's stops. Each stop with an "id" keeps its arrived
-- and departed times; stops left out are removed, unless they already have
-- times on them. The first stop must be a pickup, the last a delivery, and
-- appointments must run in order.
create function public.save_load_stops(target_load uuid, stops jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  stop jsonb;
  pos integer := 0;
  previous timestamp;
  kept uuid[] := '{}';
begin
  select organization_id into org from public.loads where id = target_load;
  if org is null or not public.is_organization_member(org) then
    raise exception 'That load doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;

  if jsonb_typeof(stops) <> 'array' or jsonb_array_length(stops) < 2 then
    raise exception 'A load needs a pickup and a delivery.' using errcode = '22023', hint = 'too_few';
  end if;
  if jsonb_array_length(stops) > 50 then
    raise exception 'A load can have at most 50 stops.' using errcode = '22023', hint = 'too_many';
  end if;
  if stops->0->>'kind' <> 'pickup' or stops->-1->>'kind' <> 'delivery' then
    raise exception 'Start with a pickup and end with a delivery.' using errcode = '22023', hint = 'order';
  end if;

  for stop in select * from jsonb_array_elements(stops) loop
    if previous is not null and (stop->>'appointment_start')::timestamp < previous then
      raise exception 'Stops must be in appointment order.' using errcode = '22023', hint = 'order';
    end if;
    previous := (stop->>'appointment_start')::timestamp;
    if stop ? 'id' and stop->>'id' is not null then
      kept := kept || (stop->>'id')::uuid;
    end if;
  end loop;

  if exists (
    select 1 from public.load_stops
    where load_id = target_load
      and id <> all (kept)
      and arrived_at is not null
  ) then
    raise exception 'A stop the driver has already checked in at can''t be removed.'
      using errcode = '22023', hint = 'has_times';
  end if;

  delete from public.load_stops where load_id = target_load and id <> all (kept);

  for stop in select * from jsonb_array_elements(stops) loop
    pos := pos + 1;
    if stop ? 'id' and stop->>'id' is not null then
      update public.load_stops
      set position = pos,
          kind = stop->>'kind',
          location = trim(stop->>'location'),
          appointment_start = (stop->>'appointment_start')::timestamp,
          appointment_end = (stop->>'appointment_end')::timestamp,
          stop_number = nullif(trim(stop->>'stop_number'), ''),
          notes = nullif(trim(stop->>'notes'), '')
      where id = (stop->>'id')::uuid and load_id = target_load;
      if not found then
        raise exception 'That stop isn''t on this load anymore.' using errcode = 'P0002', hint = 'stop_not_found';
      end if;
    else
      insert into public.load_stops
        (organization_id, load_id, position, kind, location, appointment_start,
         appointment_end, stop_number, notes)
      values (
        org, target_load, pos, stop->>'kind', trim(stop->>'location'),
        (stop->>'appointment_start')::timestamp,
        (stop->>'appointment_end')::timestamp,
        nullif(trim(stop->>'stop_number'), ''),
        nullif(trim(stop->>'notes'), '')
      );
    end if;
  end loop;
end;
$$;

revoke execute on function public.save_load_stops(uuid, jsonb) from public, anon;
grant execute on function public.save_load_stops(uuid, jsonb) to authenticated;

-- Adds a load with its stops and rate con charges, in one transaction.
-- `details` holds the loads columns a person fills in. Typed in by a person,
-- so the charges are version 1, approved.
create function public.create_load(
  target_organization uuid,
  details jsonb,
  stops jsonb,
  charges jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  total numeric;
  version_id uuid;
begin
  if not public.is_organization_member(target_organization) then
    raise exception 'You aren''t a member of this organization.' using errcode = '42501', hint = 'not_allowed';
  end if;

  total := public.load_charges_total(charges);

  -- The summary columns start from the first and last stop; the stops
  -- trigger keeps them in step from here on.
  insert into public.loads (
    organization_id, reference, reference_numbers, broker_id, broker_name,
    rate_con_from, equipment, commodity, weight_lbs, trailer_number,
    truck_id, driver_id, miles, empty_miles, notes,
    pickup_location, pickup_start, pickup_end,
    delivery_location, delivery_start, delivery_end,
    rate, detention_free_hours, detention_rate, created_by
  )
  values (
    target_organization,
    trim(details->>'reference'),
    details->>'reference_numbers',
    (details->>'broker_id')::uuid,
    trim(details->>'broker_name'),
    details->>'rate_con_from',
    details->>'equipment',
    details->>'commodity',
    (details->>'weight_lbs')::integer,
    details->>'trailer_number',
    (details->>'truck_id')::uuid,
    (details->>'driver_id')::uuid,
    (details->>'miles')::integer,
    (details->>'empty_miles')::integer,
    details->>'notes',
    stops->0->>'location',
    (stops->0->>'appointment_start')::timestamp,
    (stops->0->>'appointment_end')::timestamp,
    stops->-1->>'location',
    (stops->-1->>'appointment_start')::timestamp,
    (stops->-1->>'appointment_end')::timestamp,
    total,
    (details->>'detention_free_hours')::numeric,
    (details->>'detention_rate')::numeric,
    auth.uid()
  )
  returning id into new_id;

  perform public.save_load_stops(new_id, stops);

  insert into public.load_rate_versions
    (organization_id, load_id, version, status, source, charges, total,
     detention_free_hours, detention_rate, reviewed_by, reviewed_at)
  values (
    target_organization, new_id, 1, 'approved', 'manual', charges, total,
    (details->>'detention_free_hours')::numeric,
    (details->>'detention_rate')::numeric,
    auth.uid(), now()
  )
  returning id into version_id;

  perform public.apply_load_rate_version(version_id);
  return new_id;
end;
$$;

revoke execute on function public.create_load(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_load(uuid, jsonb, jsonb, jsonb) to authenticated;

-- A new set of rate con charges for a load, e.g. from a revised rate con.
-- A person typing it in applies it straight away (approve = true); the app
-- reading one from a rate con leaves it pending for a person to review.
create function public.revise_load_rate(
  target_load uuid,
  charges jsonb,
  free_hours numeric,
  hourly_rate numeric,
  note text,
  approve boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  total numeric;
  next_version integer;
  version_id uuid;
begin
  select organization_id into org from public.loads where id = target_load for update;
  if org is null or not public.is_organization_member(org) then
    raise exception 'That load doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if (free_hours is null) <> (hourly_rate is null) then
    raise exception 'Enter both the free hours and the hourly rate, or neither.'
      using errcode = '22023', hint = 'detention_terms';
  end if;

  total := public.load_charges_total(charges);

  -- A new version replaces one still waiting for review.
  update public.load_rate_versions
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
  where load_id = target_load and status = 'pending';

  select coalesce(max(version), 0) + 1 into next_version
  from public.load_rate_versions where load_id = target_load;

  insert into public.load_rate_versions
    (organization_id, load_id, version, status, source, charges, total,
     detention_free_hours, detention_rate, note, reviewed_by, reviewed_at)
  values (
    org, target_load, next_version,
    case when approve then 'approved' else 'pending' end,
    case when approve then 'manual' else 'rate_con' end,
    charges, total, free_hours, hourly_rate, nullif(trim(note), ''),
    case when approve then auth.uid() end,
    case when approve then now() end
  )
  returning id into version_id;

  if approve then
    perform public.apply_load_rate_version(version_id);
  end if;
  return version_id;
end;
$$;

revoke execute on function public.revise_load_rate(uuid, jsonb, numeric, numeric, text, boolean) from public, anon;
grant execute on function public.revise_load_rate(uuid, jsonb, numeric, numeric, text, boolean) to authenticated;

-- A person approves or rejects a pending version.
create function public.review_load_rate_version(target_version uuid, approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.load_rate_versions;
begin
  select * into v from public.load_rate_versions where id = target_version for update;
  if v.id is null or not public.is_organization_member(v.organization_id) then
    raise exception 'That rate version doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v.status <> 'pending' then
    raise exception 'That rate version has already been reviewed.' using errcode = '22023', hint = 'reviewed';
  end if;

  update public.load_rate_versions
  set status = case when approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = target_version;

  if approve then
    perform public.apply_load_rate_version(target_version);
  end if;
end;
$$;

revoke execute on function public.review_load_rate_version(uuid, boolean) from public, anon;
grant execute on function public.review_load_rate_version(uuid, boolean) to authenticated;

-- The driver taps arrived or departed at a stop. Times come from the server
-- clock, never the phone, and can't be overwritten once set. Departing the
-- last pickup marks a dispatched load loaded; departing the last delivery
-- marks it delivered.
create function public.record_stop_event(target_stop uuid, event text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.load_stops;
  load_status text;
  stamped timestamptz := now();
  last_pickup smallint;
  last_stop smallint;
begin
  select * into s from public.load_stops where id = target_stop for update;
  if s.id is null or not public.is_organization_member(s.organization_id) then
    raise exception 'That stop doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;

  select status into load_status from public.loads where id = s.load_id for update;
  if load_status in ('booked', 'cancelled', 'tonu') then
    raise exception 'Dispatch the load before checking in at stops.'
      using errcode = '22023', hint = 'not_dispatched';
  end if;

  if event = 'arrived' then
    if s.arrived_at is not null then
      raise exception 'Arrival is already recorded.' using errcode = '22023', hint = 'already';
    end if;
    update public.load_stops
    set arrived_at = stamped, arrived_by = auth.uid()
    where id = target_stop;
  elsif event = 'departed' then
    if s.arrived_at is null then
      raise exception 'Tap arrived first.' using errcode = '22023', hint = 'not_arrived';
    end if;
    if s.departed_at is not null then
      raise exception 'Departure is already recorded.' using errcode = '22023', hint = 'already';
    end if;
    update public.load_stops
    set departed_at = stamped, departed_by = auth.uid()
    where id = target_stop;
  else
    raise exception 'Unknown stop event.' using errcode = '22023', hint = 'bad_event';
  end if;

  select max(position) filter (where kind = 'pickup'), max(position)
  into last_pickup, last_stop
  from public.load_stops where load_id = s.load_id;

  if event = 'departed' and s.position = last_pickup and load_status = 'dispatched' then
    update public.loads set status = 'loaded' where id = s.load_id;
  elsif event = 'departed' and s.position = last_stop and load_status in ('dispatched', 'loaded') then
    update public.loads set status = 'delivered' where id = s.load_id;
  end if;

  return stamped;
end;
$$;

revoke execute on function public.record_stop_event(uuid, text) from public, anon;
grant execute on function public.record_stop_event(uuid, text) to authenticated;

-- ------------------------------------------- Apply driver rate (again) -----

-- Dispatched loads haven't been driven yet either, so they move to a
-- driver's new rate along with booked ones.
create or replace function public.apply_driver_rate_to_upcoming_loads(target_driver uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  changed integer;
begin
  select organization_id into org
  from public.drivers
  where id = target_driver;

  if org is null then
    raise exception 'That driver doesn''t exist.'
      using errcode = 'P0002', hint = 'not_found';
  end if;

  if coalesce(public.organization_role(org), '') not in ('owner', 'admin') then
    raise exception 'Only owners and admins can change driver pay.'
      using errcode = '42501', hint = 'not_allowed';
  end if;

  perform set_config('officetruck.relock_driver_pay', 'on', true);

  update public.loads l
  set driver_pay_type = d.pay_type
  from public.drivers d
  where d.id = target_driver
    and l.driver_id = target_driver
    and l.organization_id = org
    and l.status in ('booked', 'dispatched')
    and (l.driver_pay_type, l.driver_pay_rate)
        is distinct from (d.pay_type, d.pay_rate);
  get diagnostics changed = row_count;

  perform set_config('officetruck.relock_driver_pay', 'off', true);
  return changed;
end;
$$;
