-- Owners and admins can delete a load: one entered by mistake, a duplicate.
-- Its stops, check-ins, charges, paperwork, expenses and dispatch history go
-- with it (they cascade). Cancelling is still the way to record a load that
-- fell through.
--
-- A load that's been billed or paid stays, so those records stay whole:
--   * it has an invoice that isn't void (void it first), or
--   * it's on a paid driver pay statement (load_ids keeps what was paid).
-- The guard is a trigger, so it holds however the delete arrives. Deleting
-- the whole organization still removes its loads: that delete cascades, one
-- trigger level deeper.
--
-- Deleting goes through delete_load(), not a delete grant on loads: the
-- stops' own triggers (keeping the load's pickup and delivery summary) call
-- functions members can't run, so a plain delete by a member would fail
-- partway.

create function public.loads_refuse_billed_delete()
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
    raise exception 'This load has an invoice. Void the invoice first, or cancel the load instead.'
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

create trigger loads_refuse_billed_delete
  before delete on public.loads
  for each row execute function public.loads_refuse_billed_delete();

-- Deletes a load and everything on it. Owners and admins only; the trigger
-- above refuses billed and paid loads. Returns the reference, for the
-- confirmation message.
create function public.delete_load(target_load uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  found public.loads;
begin
  select * into found from public.loads where id = target_load;
  if found.id is null
    or coalesce(public.organization_role(found.organization_id), '') not in ('owner', 'admin') then
    raise exception 'Only owners and admins can delete loads.' using errcode = '42501', hint = 'not_allowed';
  end if;
  delete from public.loads where id = target_load;
  return found.reference;
end;
$$;

revoke execute on function public.delete_load(uuid) from public, anon;
grant execute on function public.delete_load(uuid) to authenticated;
