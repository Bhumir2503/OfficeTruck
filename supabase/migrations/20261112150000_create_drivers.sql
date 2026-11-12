-- Drivers: the people who run an organization's loads. Any member can see
-- them; owners and admins add and update them. There is no delete policy: a
-- driver who leaves is marked inactive instead, so past loads keep a record.

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 1 and 120),
  phone text check (char_length(phone) <= 30),
  email text check (char_length(email) <= 254),

  -- Commercial driver's license, and the state that issued it.
  cdl_number text check (char_length(trim(cdl_number)) between 1 and 30),
  cdl_state text check (cdl_state in (
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI',
    'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN',
    'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
    'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
    'WV', 'WI', 'WY', 'AS', 'GU', 'MP', 'PR', 'VI'
  )),
  cdl_expires_on date,
  -- DOT medical examiner's certificate.
  medical_card_expires_on date,

  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text check (char_length(notes) <= 2000),

  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The list: an organization's drivers by name.
create index drivers_organization_name_idx
  on public.drivers (organization_id, lower(full_name));

-- Keeps updated_at current, and stops an update from moving a driver to
-- another organization or rewriting who added them.
create function public.drivers_before_update()
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

create trigger drivers_before_update
  before update on public.drivers
  for each row execute function public.drivers_before_update();

alter table public.drivers enable row level security;

grant select, insert, update on public.drivers to authenticated;

create policy "Members can view their organization's drivers"
  on public.drivers for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Owners and admins can add drivers"
  on public.drivers for insert
  to authenticated
  with check (
    (select public.organization_role(organization_id)) in ('owner', 'admin')
    and created_by = (select auth.uid())
  );

create policy "Owners and admins can update drivers"
  on public.drivers for update
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'))
  with check ((select public.organization_role(organization_id)) in ('owner', 'admin'));
