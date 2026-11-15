-- A draft's number can be typed over on the invoice itself, e.g. to pick up
-- where an old billing system left off. Numbering continues from it: the
-- next invoice gets the number after the highest one used. A sent invoice
-- keeps the number it went out with.

create function public.set_invoice_number(target_invoice uuid, new_number integer)
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
    raise exception 'A sent invoice keeps its number. Void it and make a new one to change it.'
      using errcode = '22023', hint = 'not_draft';
  end if;
  if new_number is null or new_number < 1 or new_number > 999999999 then
    raise exception 'Enter a whole number, like 1001.' using errcode = '22023', hint = 'bad_number';
  end if;
  if new_number = i.number then
    return;
  end if;
  if exists (
    select 1 from public.invoices
    where organization_id = i.organization_id and number = new_number
  ) then
    raise exception 'Invoice % already exists. Choose another number.', new_number
      using errcode = '23505', hint = 'taken';
  end if;

  update public.invoices set number = new_number where id = target_invoice;

  -- Carry on from here.
  update public.organizations
  set next_invoice_number = greatest(next_invoice_number, new_number + 1)
  where id = i.organization_id;
end;
$$;

revoke execute on function public.set_invoice_number(uuid, integer) from public, anon;
grant execute on function public.set_invoice_number(uuid, integer) to authenticated;
