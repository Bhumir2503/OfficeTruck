-- Invoicing on its own: when a delivered load has its paperwork in (the rate
-- con, BOL and POD, and any lumper receipt it's charged for), the invoice
-- is made and the packet emailed to the broker, or to the factoring
-- company for factored loads. Customers who take invoices through a portal
-- get a draft to upload, since nobody can do that for them. Unpaid
-- invoices get a reminder the day after they're due, then weekly, three at
-- most (not factored ones: the factoring company collects those).
--
-- Off until the company turns it on; each customer can follow the company
-- or be switched on or off (brokers.auto_invoice). Only loads delivered
-- since it was turned on are invoiced, so switching it on doesn't bill an
-- old backlog by surprise.
--
-- The web app does the work (/api/cron/invoices, which builds the packet
-- PDF and emails it). pg_cron calls it every 10 minutes through pg_net,
-- with the same Vault secrets as the broker updates ('app_url',
-- 'cron_secret'). The invoice functions below also accept that job's
-- secret key, since there's no signed-in member behind it.

alter table public.organizations
  add column auto_invoice boolean not null default false,
  add column auto_invoice_since timestamptz,
  add column auto_invoice_reminders boolean not null default false;

grant update (auto_invoice, auto_invoice_reminders)
  on public.organizations to authenticated;

-- Turning it on marks where it starts from; turning it off clears it.
create function public.organizations_auto_invoice_since()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.auto_invoice and not coalesce(old.auto_invoice, false) then
    new.auto_invoice_since := now();
  elsif not new.auto_invoice then
    new.auto_invoice_since := null;
  end if;
  return new;
end;
$$;

create trigger organizations_auto_invoice_since
  before update of auto_invoice on public.organizations
  for each row execute function public.organizations_auto_invoice_since();

-- On, off, or null to follow the company.
alter table public.brokers
  add column auto_invoice boolean;

-- True for the app's own scheduled jobs, which use the secret key.
create function public.is_system()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.role()) = 'service_role', false)
$$;

-- ---------------------------------------- Invoice functions, for jobs ---

create or replace function public.create_invoice(target_load uuid)
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
  if l.id is null or not (public.is_organization_member(l.organization_id) or public.is_system()) then
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

create or replace function public.send_invoice(target_invoice uuid, via text, recipients text[])
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
  if i.id is null or not (public.is_organization_member(i.organization_id) or public.is_system()) then
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

create or replace function public.record_invoice_reminder(target_invoice uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.invoices;
begin
  select * into i from public.invoices where id = target_invoice for update;
  if i.id is null or not (public.is_organization_member(i.organization_id) or public.is_system()) then
    raise exception 'That invoice doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if i.status <> 'sent' then
    raise exception 'Only an unpaid invoice gets a reminder.' using errcode = '22023', hint = 'not_sent';
  end if;
  update public.invoices
  set reminder_count = reminder_count + 1, last_reminded_at = now()
  where id = target_invoice;
end;
$$;

grant execute on function public.create_invoice(uuid) to service_role;
grant execute on function public.send_invoice(uuid, text, text[]) to service_role;
grant execute on function public.record_invoice_reminder(uuid) to service_role;

-- ------------------------------------------------------------ Schedule --

-- Asks the web app to run invoicing, when any company has it on and Vault
-- has the app's address and the cron secret.
create function public.kick_invoicing()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  secret text;
begin
  if not exists (
    select 1 from public.organizations where auto_invoice or auto_invoice_reminders
  ) then
    return;
  end if;
  select decrypted_secret into base from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if base is null or secret is null then
    return;
  end if;
  perform net.http_get(
    url := rtrim(base, '/') || '/api/cron/invoices',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.kick_invoicing()
  from public, anon, authenticated;

select cron.schedule(
  'auto-invoicing',
  '*/10 * * * *',
  'select public.kick_invoicing()'
);
