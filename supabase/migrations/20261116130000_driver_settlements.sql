-- Driver pay. Each driver is settled weekly, Monday to Sunday by delivery
-- date: their delivered loads at the rate locked on each load, plus what
-- they paid out of pocket on those loads, plus or minus adjustments like an
-- advance or a bonus. Until it's paid the settlement is worked out live from
-- the loads; marking it paid freezes the totals and the loads it covered, so
-- later edits to a load don't change what was paid.
--
-- A settlement row only exists once there's something to keep: an
-- adjustment, a note or a payment. Pay is private, so only owners and
-- admins can see or change it.

create table public.driver_settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  driver_id uuid not null,
  -- The Monday the pay week starts.
  week_start date not null check (extract(isodow from week_start) = 1),
  status text not null default 'open' check (status in ('open', 'paid')),
  notes text check (char_length(notes) <= 1000),

  -- Frozen when paid; null while open.
  paid_on date,
  load_ids uuid[],
  gross_pay numeric(10, 2),
  reimbursements numeric(10, 2),
  adjustments numeric(10, 2),
  net_pay numeric(10, 2),
  constraint driver_settlements_paid_frozen check (
    (status = 'paid') = (paid_on is not null)
    and (status = 'paid') = (net_pay is not null)
    and (status = 'paid') = (load_ids is not null)
  ),

  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, id),
  unique (organization_id, driver_id, week_start),
  foreign key (organization_id, driver_id)
    references public.drivers (organization_id, id) on delete cascade
);

create index driver_settlements_week_idx
  on public.driver_settlements (organization_id, week_start);

create function public.driver_settlements_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.organization_id := old.organization_id;
  new.driver_id := old.driver_id;
  new.week_start := old.week_start;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger driver_settlements_before_update
  before update on public.driver_settlements
  for each row execute function public.driver_settlements_before_update();

alter table public.driver_settlements enable row level security;

grant select, insert, update on public.driver_settlements to authenticated;

create policy "Owners and admins can view settlements"
  on public.driver_settlements for select
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));

create policy "Owners and admins can start settlements"
  on public.driver_settlements for insert
  to authenticated
  with check (
    (select public.organization_role(organization_id)) in ('owner', 'admin')
    and created_by = (select auth.uid())
  );

create policy "Owners and admins can update settlements"
  on public.driver_settlements for update
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'))
  with check ((select public.organization_role(organization_id)) in ('owner', 'admin'));


-- Money added to or taken off a week's pay. Positive adds (a bonus, a
-- detention payout), negative takes off (an advance, escrow, a fuel card
-- charge). Locked once the settlement is paid.
create table public.driver_settlement_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  settlement_id uuid not null,
  description text not null check (char_length(trim(description)) between 1 and 200),
  amount numeric(10, 2) not null
    check (amount <> 0 and abs(amount) <= 99999999.99),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, settlement_id)
    references public.driver_settlements (organization_id, id) on delete cascade
);

create index driver_settlement_adjustments_settlement_idx
  on public.driver_settlement_adjustments (settlement_id);

-- Adjustments can't change once the week is paid.
create function public.driver_settlement_adjustments_open()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.driver_settlements
    where id = coalesce(new.settlement_id, old.settlement_id)
      and status = 'paid'
  ) then
    raise exception 'This week is already paid. Undo the payment to change it.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger driver_settlement_adjustments_open
  before insert or update or delete on public.driver_settlement_adjustments
  for each row execute function public.driver_settlement_adjustments_open();

alter table public.driver_settlement_adjustments enable row level security;

grant select, insert, delete on public.driver_settlement_adjustments to authenticated;

create policy "Owners and admins can view adjustments"
  on public.driver_settlement_adjustments for select
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));

create policy "Owners and admins can add adjustments"
  on public.driver_settlement_adjustments for insert
  to authenticated
  with check (
    (select public.organization_role(organization_id)) in ('owner', 'admin')
    and created_by = (select auth.uid())
  );

create policy "Owners and admins can remove adjustments"
  on public.driver_settlement_adjustments for delete
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));
