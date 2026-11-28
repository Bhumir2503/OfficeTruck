-- A TONU load (truck ordered, not used) is billed only what the broker owes
-- for the TONU, not the linehaul it never hauled. Marking a load TONU used to
-- add the TONU charge on top of the rate con's charges, so its rate and its
-- invoice still included the linehaul.
--
-- Now, when a load becomes TONU its rate con charges (linehaul, fuel
-- surcharge, stop-offs from the rate con) are taken off; the TONU charge and
-- other accessorials stay. Reopening it puts the latest approved rate con
-- charges back and drops the TONU charge, since reopening means the TONU was
-- a mistake.

create function public.loads_tonu_charges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest uuid;
begin
  if new.status = 'tonu' and old.status is distinct from 'tonu' then
    delete from public.load_charges
    where load_id = new.id and source = 'rate_con';
  elsif old.status = 'tonu' and new.status is distinct from 'tonu' then
    delete from public.load_charges
    where load_id = new.id and kind = 'tonu';
    select v.id into latest
    from public.load_rate_versions v
    where v.load_id = new.id and v.status = 'approved'
    order by v.version desc
    limit 1;
    if latest is not null then
      perform public.apply_load_rate_version(latest);
    end if;
  end if;
  return null;
end;
$$;

revoke execute on function public.loads_tonu_charges() from public, anon, authenticated;

create trigger loads_tonu_charges
  after update of status on public.loads
  for each row
  when (old.status is distinct from new.status
        and (new.status = 'tonu' or old.status = 'tonu'))
  execute function public.loads_tonu_charges();

-- TONU loads already marked, whose invoice hasn't gone out: take the rate con
-- charges off now. A sent or paid invoice keeps the total it was sent with.
delete from public.load_charges c
using public.loads l
where c.load_id = l.id
  and l.status = 'tonu'
  and c.source = 'rate_con'
  and not exists (
    select 1 from public.invoices i
    where i.load_id = l.id and i.status in ('sent', 'paid')
  );
