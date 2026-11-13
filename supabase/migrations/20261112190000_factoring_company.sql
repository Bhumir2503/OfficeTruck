-- The factoring company a carrier sells its invoices to. When a broker's
-- loads are factored, the invoice packet goes here instead of to the broker,
-- and the broker pays the factoring company's remit-to address.
--
-- One per organization. Any member can see it (it shows on brokers and
-- loads); owners and admins set it, like the company profile.

create table public.factoring_companies (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 200),

  -- How they take invoice packets: by email, or uploaded to their portal by
  -- hand (the app never claims to have sent those).
  submission_method text not null default 'email'
    check (submission_method in ('email', 'portal')),
  submission_emails text[] not null default '{}'
    check (cardinality(submission_emails) <= 10),
  portal_url text check (char_length(portal_url) <= 500),

  phone text check (char_length(phone) <= 30),
  -- Where brokers send payment for factored loads. Goes on the invoice and
  -- the notice of assignment.
  remit_line1 text check (char_length(remit_line1) <= 200),
  remit_line2 text check (char_length(remit_line2) <= 200),
  remit_city text check (char_length(remit_city) <= 100),
  remit_state text check (remit_state in (
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI',
    'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN',
    'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
    'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
    'WV', 'WI', 'WY', 'AS', 'GU', 'MP', 'PR', 'VI'
  )),
  remit_postal_code text check (remit_postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'),

  notes text check (char_length(notes) <= 2000),

  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.factoring_companies_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.organization_id := old.organization_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger factoring_companies_before_update
  before update on public.factoring_companies
  for each row execute function public.factoring_companies_before_update();

alter table public.factoring_companies enable row level security;

-- Setting it up is an insert, changing it an update. To stop factoring,
-- untick it on the brokers; the company stays on record.
grant select, insert, update on public.factoring_companies to authenticated;

create policy "Members can view their factoring company"
  on public.factoring_companies for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Owners and admins can set the factoring company"
  on public.factoring_companies for insert
  to authenticated
  with check ((select public.organization_role(organization_id)) in ('owner', 'admin'));

create policy "Owners and admins can change the factoring company"
  on public.factoring_companies for update
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'))
  with check ((select public.organization_role(organization_id)) in ('owner', 'admin'));
