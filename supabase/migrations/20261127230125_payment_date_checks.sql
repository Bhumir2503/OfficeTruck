-- A payment can't be dated before its invoice was sent, or in the future.
-- Both slipped through: a payment dated weeks before the invoice made the
-- invoice look paid before it was billed. (current_date + 1 leaves room for
-- a company whose day is ahead of the server's.)

create or replace function public.record_invoice_payment(
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
  if i.invoice_date is not null and paid < i.invoice_date then
    raise exception 'The payment date is before the invoice date (%). Check the date.',
      to_char(i.invoice_date, 'Mon FMDD, YYYY')
      using errcode = '22023', hint = 'paid_before_invoice';
  end if;
  if paid > current_date + 1 then
    raise exception 'The payment date is in the future. Record it once it''s paid.'
      using errcode = '22023', hint = 'paid_in_future';
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
