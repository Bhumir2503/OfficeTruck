-- Invoices: one bill per load, from draft to paid.
--
--   * A draft is made from a delivered (or TONU) load and gets the company's
--     next invoice number straight away. While it's a draft its lines are
--     the load's charges as they are now, so a late lumper or detention
--     still makes it on.
--   * Sending freezes the lines and total, dates it, and works out when it's
--     due from the terms. The app emails the packet first and records the
--     send only once the email went, or records a send done by hand (a
--     broker or factoring portal). The load moves to invoiced, or factored
--     when the broker's loads are factored.
--   * Recording the payment marks it paid, and the load too (a factored
--     load stays factored: the broker pays the factoring company).
--   * Voiding a sent invoice puts the load back to delivered so it can be
--     billed again. A draft is deleted instead.
--   * Overdue isn't stored: it's a sent invoice past its due date.
--   * Invoicing is the only way a load reaches invoiced, paid or factored
--     once it has an invoice; marking a load by hand is for loads billed
--     outside OfficeTruck.

-- ------------------------------------------------------- Numbering -----

alter table public.organizations
  add column next_invoice_number integer not null default 1001
    check (next_invoice_number between 1 and 999999999);

grant update (next_invoice_number) on public.organizations to authenticated;

-- ---------------------------------------------------------- Invoices -----

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  load_id uuid not null,
  number integer not null check (number >= 1),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'void')),

  -- Printed on the invoice.
  notes text check (char_length(notes) <= 1000),
  -- Days to pay, from the broker's terms when the draft was made.
  terms_days integer not null check (terms_days between 0 and 365),

  -- Set when it's sent.
  invoice_date date,
  due_on date,
  -- Whether it went to the factoring company instead of the broker.
  factored boolean,
  -- The charges billed: [{ "kind": "linehaul", "description": null, "amount": 2450.00 }, …]
  lines jsonb check (lines is null or jsonb_typeof(lines) = 'array'),
  total numeric(10, 2) check (total >= 0),
  sent_at timestamptz,
  sent_by uuid references auth.users (id) on delete set null,
  -- email: sent from OfficeTruck. portal: uploaded by hand. other: mailed,
  -- emailed from elsewhere…
  sent_via text check (sent_via in ('email', 'portal', 'other')),
  sent_to text[] not null default '{}' check (cardinality(sent_to) <= 10),

  -- Set when it's paid.
  paid_on date,
  paid_amount numeric(10, 2) check (paid_amount >= 0),
  -- A check number, ACH trace or the like.
  payment_reference text check (char_length(payment_reference) <= 100),
  paid_recorded_by uuid references auth.users (id) on delete set null,

  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text check (char_length(void_reason) <= 500),

  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint invoices_number_key unique (organization_id, number),
  constraint invoices_sent_set check (
    status = 'draft'
    or (invoice_date is not null and due_on is not null and lines is not null
        and total is not null and sent_at is not null and sent_via is not null
        and factored is not null)
  ),
  constraint invoices_paid_set check (
    status <> 'paid' or (paid_on is not null and paid_amount is not null)
  ),
  foreign key (organization_id, load_id)
    references public.loads (organization_id, id) on delete cascade
);

-- One live invoice per load; a voided one doesn't count.
create unique index invoices_one_per_load_idx
  on public.invoices (load_id) where status <> 'void';

create index invoices_organization_idx
  on public.invoices (organization_id, status, number desc);

alter table public.invoices enable row level security;

-- Everything is written through the functions below.
grant select on public.invoices to authenticated;

create policy "Members can view their organization's invoices"
  on public.invoices for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

-- ------------------------------------------------------ Status rules -----

-- As before, plus: invoicing (reason 'invoicing') moves a load between
-- delivered, invoiced, paid and factored in either direction, so voiding an
-- invoice can put the load back to delivered.
create or replace function public.loads_status_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  flow text[] := array['booked', 'dispatched', 'loaded', 'delivered', 'invoiced', 'paid', 'factored'];
  on_the_road text[] := array['dispatched', 'loaded', 'delivered'];
  billing text[] := array['delivered', 'invoiced', 'paid', 'factored'];
  reason text := coalesce(current_setting('officetruck.status_reason', true), '');
  old_i integer := array_position(flow, old.status);
  new_i integer := array_position(flow, new.status);
  from_documents boolean :=
    reason = 'documents'
    and old.status = any (on_the_road)
    and new.status = any (on_the_road);
  from_invoicing boolean :=
    reason = 'invoicing'
    and old.status = any (billing)
    and new.status = any (billing);
begin
  if new.status is distinct from old.status then
    if new.status = 'dispatched' and reason <> 'dispatched' and not from_documents then
      raise exception 'Use Send to driver to dispatch a load.'
        using errcode = '42501', hint = 'dispatch_only';
    end if;

    -- In transit and Delivered come from what happens, or Mark complete.
    if new.status in ('loaded', 'delivered')
       and reason not in ('documents', 'checkin', 'completed')
       and not from_invoicing then
      raise exception 'In transit and Delivered are set from the BOL, POD and check-ins. Use Mark complete if they won''t come.'
        using errcode = '42501', hint = 'automatic_only';
    end if;

    if old_i is not null and new_i is not null and new_i < old_i
       and not (reason = 'unassigned' and old.status = 'dispatched' and new.status = 'booked')
       and not from_documents
       and not from_invoicing then
      raise exception 'A load''s status only moves forward. To send a dispatched load back to booked, unassign it.'
        using errcode = '42501', hint = 'backward';
    end if;

    if old_i is null and new_i is not null
       and not (reason = 'reopened' and new.status = 'booked') then
      raise exception 'Reopen a canceled load to put it back to booked.'
        using errcode = '42501', hint = 'reopen_only';
    end if;
  end if;

  -- Only Mark complete sets the flag; anything leaving the delivered end of
  -- the flow clears it.
  if new.completed_manually and not old.completed_manually and reason <> 'completed' then
    new.completed_manually := false;
  end if;
  if new.status in ('booked', 'dispatched', 'loaded', 'cancelled', 'tonu') then
    new.completed_manually := false;
    new.completed_by := null;
    new.completed_at := null;
  elsif not new.completed_manually then
    new.completed_by := null;
    new.completed_at := null;
  elsif reason <> 'completed' then
    new.completed_by := old.completed_by;
    new.completed_at := old.completed_at;
  end if;

  -- A dispatched load's driver has been sent it, so swapping them takes an
  -- unassign (which tells them) first.
  if old.status = 'dispatched' and new.status = 'dispatched'
     and new.driver_id is distinct from old.driver_id then
    raise exception 'Unassign the load before changing its driver.'
      using errcode = '42501', hint = 'unassign_first';
  end if;

  return new;
end;
$$;

-- Moves a load for invoicing, logged with a note like "Invoice 1001 sent".
create function public.set_load_status_for_invoice(target_load uuid, to_status text, why text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('officetruck.status_reason', 'invoicing', true);
  perform set_config('officetruck.status_detail', why, true);
  update public.loads set status = to_status
  where id = target_load and status is distinct from to_status;
  perform set_config('officetruck.status_reason', '', true);
  perform set_config('officetruck.status_detail', '', true);
end;
$$;

revoke execute on function public.set_load_status_for_invoice(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------- Functions -----

-- Keeps updated_at current.
create function public.invoices_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger invoices_before_update
  before update on public.invoices
  for each row execute function public.invoices_before_update();

-- A draft invoice for a delivered or TONU load, with the next number.
create function public.create_invoice(target_load uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.loads;
  terms integer;
  next_number integer;
  new_id uuid;
begin
  select * into l from public.loads where id = target_load for update;
  if l.id is null or not public.is_organization_member(l.organization_id) then
    raise exception 'That load doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if exists (select 1 from public.invoices where load_id = target_load and status <> 'void') then
    raise exception 'This load already has an invoice.' using errcode = '23505', hint = 'exists';
  end if;
  if l.status not in ('delivered', 'tonu') then
    raise exception 'Only delivered or TONU loads can be invoiced.'
      using errcode = '22023', hint = 'not_delivered';
  end if;

  select payment_terms_days into terms from public.brokers where id = l.broker_id;

  -- Locks the counter, and skips past any number already used (someone may
  -- have set the next number lower than the last invoice).
  select greatest(
    o.next_invoice_number,
    coalesce((select max(number) + 1 from public.invoices where organization_id = o.id), 1)
  ) into next_number
  from public.organizations o
  where o.id = l.organization_id
  for update;

  update public.organizations
  set next_invoice_number = next_number + 1
  where id = l.organization_id;

  insert into public.invoices (organization_id, load_id, number, terms_days)
  values (l.organization_id, l.id, next_number, coalesce(terms, 30))
  returning id into new_id;

  return new_id;
end;
$$;

revoke execute on function public.create_invoice(uuid) from public, anon;
grant execute on function public.create_invoice(uuid) to authenticated;

-- Changes a draft's notes and terms.
create function public.update_invoice_draft(target_invoice uuid, new_notes text, new_terms integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.invoices;
begin
  select * into i from public.invoices where id = target_invoice for update;
  if i.id is null or not public.is_organization_member(i.organization_id) then
    raise exception 'That invoice doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if i.status <> 'draft' then
    raise exception 'Only a draft can be changed. Void it to bill the load again.'
      using errcode = '22023', hint = 'not_draft';
  end if;
  update public.invoices
  set notes = nullif(trim(new_notes), ''),
      terms_days = new_terms
  where id = target_invoice;
end;
$$;

revoke execute on function public.update_invoice_draft(uuid, text, integer) from public, anon;
grant execute on function public.update_invoice_draft(uuid, text, integer) to authenticated;

-- Deletes a draft. Its number isn't reused.
create function public.delete_invoice_draft(target_invoice uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.invoices;
begin
  select * into i from public.invoices where id = target_invoice for update;
  if i.id is null or not public.is_organization_member(i.organization_id) then
    raise exception 'That invoice doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if i.status <> 'draft' then
    raise exception 'A sent invoice can''t be deleted. Void it instead.'
      using errcode = '22023', hint = 'not_draft';
  end if;
  delete from public.invoices where id = target_invoice;
end;
$$;

revoke execute on function public.delete_invoice_draft(uuid) from public, anon;
grant execute on function public.delete_invoice_draft(uuid) to authenticated;

-- Records that a draft was sent: freezes the load's charges as its lines,
-- dates it and moves the load to invoiced (or factored).
create function public.send_invoice(target_invoice uuid, via text, recipients text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.invoices;
  l public.loads;
  is_factored boolean;
  frozen jsonb;
  sum_total numeric;
begin
  select * into i from public.invoices where id = target_invoice for update;
  if i.id is null or not public.is_organization_member(i.organization_id) then
    raise exception 'That invoice doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if i.status <> 'draft' then
    raise exception 'This invoice has already been sent.' using errcode = '22023', hint = 'not_draft';
  end if;
  if via not in ('email', 'portal', 'other') then
    raise exception 'Say how the invoice was sent.' using errcode = '22023', hint = 'bad_via';
  end if;

  select * into l from public.loads where id = i.load_id for update;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('kind', kind, 'description', description, 'amount', amount)
      order by case source when 'rate_con' then 0 else 1 end, position, created_at
    ),
    '[]'::jsonb
  ), coalesce(sum(amount), 0)
  into frozen, sum_total
  from public.load_charges where load_id = l.id;

  if jsonb_array_length(frozen) = 0 then
    raise exception 'Add the load''s charges before sending the invoice.'
      using errcode = '22023', hint = 'no_charges';
  end if;

  -- Factored when the broker's loads are, and there's a factoring company to send to.
  select coalesce(b.factored, false)
         and exists (select 1 from public.factoring_companies f where f.organization_id = l.organization_id)
  into is_factored
  from public.brokers b where b.id = l.broker_id;
  is_factored := coalesce(is_factored, false);

  update public.invoices
  set status = 'sent',
      invoice_date = current_date,
      due_on = current_date + terms_days,
      factored = is_factored,
      lines = frozen,
      total = sum_total,
      sent_at = now(),
      sent_by = auth.uid(),
      sent_via = via,
      sent_to = coalesce(recipients, '{}')
  where id = target_invoice;

  if l.status = 'delivered' then
    perform public.set_load_status_for_invoice(
      l.id,
      case when is_factored then 'factored' else 'invoiced' end,
      'Invoice ' || i.number || ' sent'
    );
  end if;
end;
$$;

revoke execute on function public.send_invoice(uuid, text, text[]) from public, anon;
grant execute on function public.send_invoice(uuid, text, text[]) to authenticated;

-- Records the payment on a sent invoice. A load billed to the broker moves
-- to paid; a factored load stays factored.
create function public.record_invoice_payment(
  target_invoice uuid,
  paid date,
  amount numeric,
  reference text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.invoices;
  load_status text;
begin
  select * into i from public.invoices where id = target_invoice for update;
  if i.id is null or not public.is_organization_member(i.organization_id) then
    raise exception 'That invoice doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if i.status <> 'sent' then
    raise exception 'Only a sent invoice can be marked paid.' using errcode = '22023', hint = 'not_sent';
  end if;
  if paid is null or amount is null or amount < 0 then
    raise exception 'Enter the date and amount paid.' using errcode = '22023', hint = 'payment';
  end if;

  update public.invoices
  set status = 'paid',
      paid_on = paid,
      paid_amount = amount,
      payment_reference = nullif(trim(reference), ''),
      paid_recorded_by = auth.uid()
  where id = target_invoice;

  select status into load_status from public.loads where id = i.load_id for update;
  if load_status = 'invoiced' and not i.factored then
    perform public.set_load_status_for_invoice(i.load_id, 'paid', 'Invoice ' || i.number || ' paid');
  end if;
end;
$$;

revoke execute on function public.record_invoice_payment(uuid, date, numeric, text) from public, anon;
grant execute on function public.record_invoice_payment(uuid, date, numeric, text) to authenticated;

-- Voids a sent or paid invoice and puts the load back to delivered, so it
-- can be billed again.
create function public.void_invoice(target_invoice uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.invoices;
  load_status text;
begin
  select * into i from public.invoices where id = target_invoice for update;
  if i.id is null or not public.is_organization_member(i.organization_id) then
    raise exception 'That invoice doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if i.status not in ('sent', 'paid') then
    raise exception 'Only a sent invoice can be voided. Delete a draft instead.'
      using errcode = '22023', hint = 'not_sent';
  end if;
  if char_length(trim(coalesce(reason, ''))) = 0 then
    raise exception 'Say why the invoice is being voided.' using errcode = '22023', hint = 'reason';
  end if;

  update public.invoices
  set status = 'void',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = trim(reason)
  where id = target_invoice;

  select status into load_status from public.loads where id = i.load_id for update;
  if load_status in ('invoiced', 'paid', 'factored') then
    perform public.set_load_status_for_invoice(i.load_id, 'delivered', 'Invoice ' || i.number || ' voided');
  end if;
end;
$$;

revoke execute on function public.void_invoice(uuid, text) from public, anon;
grant execute on function public.void_invoice(uuid, text) to authenticated;
