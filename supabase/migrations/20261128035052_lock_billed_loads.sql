-- Once a load's invoice has gone out, what the customer was billed has to
-- stay what the load says. Until now charges could still be added, the rate
-- revised, and the load canceled or marked TONU, even after it was paid:
-- the invoice kept its frozen total while the load (and every report built
-- on it) moved. To change a billed load, void its invoice first.

-- Charges: frozen while an invoice is sent or paid. A draft still follows
-- the load, so it can change.
create function public.load_charges_refuse_billed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  invoice_number integer;
begin
  -- Only a direct change is someone editing the bill: rows removed with
  -- their load or organization, and changes made by the load's own
  -- triggers (depth 2 and up), pass.
  if tg_op = 'DELETE' then
    target := old.load_id;
  else
    target := new.load_id;
  end if;
  if pg_trigger_depth() = 1 then
    select i.number into invoice_number
    from public.invoices i
    where i.load_id = target and i.status in ('sent', 'paid')
    limit 1;
    if found then
      raise exception 'Invoice % has gone out with these charges. Void the invoice to change them, then bill the load again.', invoice_number
        using errcode = '42501', hint = 'invoiced';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.load_charges_refuse_billed() from public, anon, authenticated;

create trigger load_charges_refuse_billed
  before insert or update or delete on public.load_charges
  for each row execute function public.load_charges_refuse_billed();

-- Status: a load with an invoice (a draft included) moves only with that
-- invoice. It can't be canceled, marked TONU or reopened underneath it.
create function public.loads_refuse_billed_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_number integer;
  invoice_status text;
begin
  if new.status is not distinct from old.status
     or new.status in ('delivered', 'invoiced', 'paid', 'factored') then
    return new;
  end if;
  select i.number, i.status into invoice_number, invoice_status
  from public.invoices i
  where i.load_id = new.id and i.status <> 'void'
  limit 1;
  if not found then
    return new;
  end if;
  if invoice_status = 'draft' then
    raise exception 'This load has draft invoice %. Delete the draft first.', invoice_number
      using errcode = '42501', hint = 'invoiced';
  end if;
  raise exception 'This load is on invoice %. Void the invoice first.', invoice_number
    using errcode = '42501', hint = 'invoiced';
end;
$$;

revoke execute on function public.loads_refuse_billed_status() from public, anon, authenticated;

create trigger loads_refuse_billed_status
  before update of status on public.loads
  for each row execute function public.loads_refuse_billed_status();

-- Deleting a billed load pointed at canceling it instead, which the rule
-- above now refuses too: say what works.
create or replace function public.loads_refuse_billed_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Part of deleting the organization.
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  if exists (
    select 1 from public.invoices i
    where i.load_id = old.id and i.status <> 'void'
  ) then
    raise exception 'This load has an invoice. Void the invoice first (or delete the draft).'
      using errcode = '42501', hint = 'invoiced';
  end if;
  if exists (
    select 1 from public.driver_settlements s
    where s.status = 'paid' and old.id = any (s.load_ids)
  ) then
    raise exception 'This load is on a paid driver pay statement, so it stays. Cancel it instead.'
      using errcode = '42501', hint = 'paid';
  end if;
  return old;
end;
$$;
