-- Trip expenses: what running a load cost, receipt by receipt. Fuel, tolls,
-- scales, parking, lumper, repairs. They feed the load's profit, and the ones
-- a driver paid out of pocket are owed back to them.
--
-- Kept apart from load_documents, which are the billing paperwork that
-- decides whether a load can be invoiced. A receipt photo is optional and
-- lives in the load-documents bucket, in the load's folder.

create table public.load_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  load_id uuid not null,
  kind text not null check (kind in (
    'fuel', 'tolls', 'scale', 'parking', 'lumper', 'repair', 'other'
  )),
  amount numeric(10, 2) not null check (amount > 0 and amount <= 99999999.99),
  spent_on date not null,
  -- company: on the company's card or account. driver: out of the driver's
  -- pocket, so it's owed back to them.
  paid_by text not null default 'company' check (paid_by in ('company', 'driver')),
  note text check (char_length(note) <= 200),

  -- The receipt photo or PDF, if there is one. All three or none.
  receipt_path text unique check (char_length(receipt_path) <= 300),
  receipt_name text check (char_length(receipt_name) <= 200),
  receipt_type text check (receipt_type in (
    'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf'
  )),
  constraint load_expenses_receipt_set check (
    (receipt_path is null) = (receipt_name is null)
    and (receipt_path is null) = (receipt_type is null)
  ),
  constraint load_expenses_receipt_in_folder check (
    receipt_path is null
    or receipt_path like organization_id::text || '/' || load_id::text || '/%'
  ),

  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (organization_id, load_id)
    references public.loads (organization_id, id) on delete cascade
);

create index load_expenses_load_idx on public.load_expenses (load_id, spent_on);

-- Keeps updated_at current, and stops an update from moving an expense to
-- another load or rewriting who added it.
create function public.load_expenses_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.organization_id := old.organization_id;
  new.load_id := old.load_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger load_expenses_before_update
  before update on public.load_expenses
  for each row execute function public.load_expenses_before_update();

alter table public.load_expenses enable row level security;

-- Like charges added on the road, any member can add, fix and remove them.
grant select, insert, update, delete on public.load_expenses to authenticated;

create policy "Members can view their organization's expenses"
  on public.load_expenses for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Members can add expenses"
  on public.load_expenses for insert
  to authenticated
  with check (
    (select public.is_organization_member(organization_id))
    and created_by = (select auth.uid())
  );

create policy "Members can change expenses"
  on public.load_expenses for update
  to authenticated
  using ((select public.is_organization_member(organization_id)))
  with check ((select public.is_organization_member(organization_id)));

create policy "Members can remove expenses"
  on public.load_expenses for delete
  to authenticated
  using ((select public.is_organization_member(organization_id)));
