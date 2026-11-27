-- An invoice sent in the evening in the US was dated the next day, because
-- current_date is the database's day (UTC). The app now says what day it is
-- where the person sending is. Anything more than a day from the database's
-- date is ignored, as is no date at all (invoices sent on a schedule).

drop function public.send_invoice(uuid, text, text[]);

create function public.send_invoice(
  target_invoice uuid,
  via text,
  recipients text[],
  sent_on date default null
)
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
  today date := current_date;
begin
  if sent_on is not null and abs(sent_on - current_date) <= 1 then
    today := sent_on;
  end if;

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
      invoice_date = today,
      due_on = today + terms_days,
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

revoke execute on function public.send_invoice(uuid, text, text[], date) from public, anon;
grant execute on function public.send_invoice(uuid, text, text[], date) to authenticated, service_role;
