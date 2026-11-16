-- Payments on an invoice, one row each, for brokers that pay in parts.
--
--   * A sent invoice stays sent (shown as partly paid) until its payments
--     cover the total, then it's paid. When a broker short-pays and nothing
--     more is coming, the office closes it out as paid with what came in.
--   * invoices.paid_amount is the total of its payments; paid_on is the day
--     it was paid off (or closed out).
--   * Any payment can be undone. A paid invoice that drops below its total
--     goes back to sent, and its load back from paid to invoiced.
--   * Only a sent invoice with no payments can be voided. A paid one is a
--     closed record: undo its payments first if it was billed wrong.

create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  paid_on date not null,
  amount numeric(10, 2) not null check (amount > 0),
  -- A check number, ACH trace or the like.
  reference text check (char_length(reference) <= 100),
  recorded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index invoice_payments_invoice_idx on public.invoice_payments (invoice_id, paid_on, created_at);

alter table public.invoice_payments enable row level security;

-- Written only through the functions below.
grant select on public.invoice_payments to authenticated;

create policy "Members can view their organization's invoice payments"
  on public.invoice_payments for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

-- Invoices already paid get their payment as a row.
insert into public.invoice_payments
  (organization_id, invoice_id, paid_on, amount, reference, recorded_by, created_at)
select organization_id, id, paid_on, paid_amount, payment_reference, paid_recorded_by, updated_at
from public.invoices
where status = 'paid' and paid_amount > 0;

-- Sent invoices start with nothing paid.
update public.invoices set paid_amount = 0 where status = 'sent' and paid_amount is null;

-- ---------------------------------------------------------- Payments -----

drop function public.record_invoice_payment(uuid, date, numeric, text);

-- Adds a payment to a sent invoice. It's paid once the payments cover the
-- total, or straight away when close_out says no more is coming. A load
-- billed to the broker then moves to paid; a factored load stays factored.
create function public.record_invoice_payment(
  target_invoice uuid,
  paid date,
  amount numeric,
  reference text,
  close_out boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.invoices;
  received numeric;
  load_status text;
begin
  select * into i from public.invoices where id = target_invoice for update;
  if i.id is null or not public.is_organization_member(i.organization_id) then
    raise exception 'That invoice doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if i.status <> 'sent' then
    raise exception 'Only a sent invoice can take a payment.' using errcode = '22023', hint = 'not_sent';
  end if;
  if paid is null or amount is null or amount <= 0 then
    raise exception 'Enter the date and an amount over $0.' using errcode = '22023', hint = 'payment';
  end if;

  insert into public.invoice_payments (organization_id, invoice_id, paid_on, amount, reference)
  values (i.organization_id, i.id, paid, amount, nullif(trim(reference), ''));

  select coalesce(sum(p.amount), 0) into received
  from public.invoice_payments p where p.invoice_id = i.id;

  if received >= i.total or close_out then
    update public.invoices
    set status = 'paid', paid_amount = received, paid_on = paid,
        payment_reference = nullif(trim(reference), ''), paid_recorded_by = auth.uid()
    where id = i.id;

    select status into load_status from public.loads where id = i.load_id for update;
    if load_status = 'invoiced' and not i.factored then
      perform public.set_load_status_for_invoice(i.load_id, 'paid', 'Invoice ' || i.number || ' paid');
    end if;
  else
    update public.invoices set paid_amount = received where id = i.id;
  end if;
end;
$$;

revoke execute on function public.record_invoice_payment(uuid, date, numeric, text, boolean) from public, anon;
grant execute on function public.record_invoice_payment(uuid, date, numeric, text, boolean) to authenticated;

-- Takes back a payment recorded by mistake. A paid invoice goes back to
-- sent, and its load from paid back to invoiced.
create function public.undo_invoice_payment(target_payment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.invoice_payments;
  i public.invoices;
  received numeric;
  load_status text;
begin
  select * into p from public.invoice_payments where id = target_payment;
  if p.id is null or not public.is_organization_member(p.organization_id) then
    raise exception 'That payment doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  select * into i from public.invoices where id = p.invoice_id for update;
  if i.status not in ('sent', 'paid') then
    raise exception 'This invoice''s payments can''t be changed.' using errcode = '22023', hint = 'not_open';
  end if;

  delete from public.invoice_payments where id = p.id;

  select coalesce(sum(x.amount), 0) into received
  from public.invoice_payments x where x.invoice_id = i.id;

  -- Overpaid: what's left still covers it, so it stays paid.
  if i.status = 'paid' and received >= i.total then
    update public.invoices set paid_amount = received where id = i.id;
    return;
  end if;

  update public.invoices
  set status = 'sent', paid_amount = received, paid_on = null,
      payment_reference = null, paid_recorded_by = null
  where id = i.id;

  if i.status = 'paid' then
    select status into load_status from public.loads where id = i.load_id for update;
    if load_status = 'paid' then
      perform public.set_load_status_for_invoice(i.load_id, 'invoiced', 'Invoice ' || i.number || ' payment undone');
    end if;
  end if;
end;
$$;

revoke execute on function public.undo_invoice_payment(uuid) from public, anon;
grant execute on function public.undo_invoice_payment(uuid) to authenticated;

-- ------------------------------------------------------------ Voiding -----

-- As before, but only a sent invoice with no payments.
create or replace function public.void_invoice(target_invoice uuid, reason text)
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
    raise exception 'Only a sent invoice can be voided. Delete a draft, or undo a paid invoice''s payments first.'
      using errcode = '22023', hint = 'not_sent';
  end if;
  if exists (select 1 from public.invoice_payments where invoice_id = i.id) then
    raise exception 'Undo this invoice''s payments before voiding it.'
      using errcode = '22023', hint = 'has_payments';
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

-- Sending starts an invoice with nothing paid.
create or replace function public.invoices_sent_starts_unpaid()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'sent' and old.status = 'draft' then
    new.paid_amount := 0;
  end if;
  return new;
end;
$$;

create trigger invoices_sent_starts_unpaid
  before update on public.invoices
  for each row execute function public.invoices_sent_starts_unpaid();
