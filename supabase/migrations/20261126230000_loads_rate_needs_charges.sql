-- A load's rate is the total of its charges, and an invoice bills the
-- charges. A load inserted straight into the table with a rate and no
-- charges showed its rate on the loads and invoices lists, and $0.00 on
-- the invoice itself.

-- Loads like that get what every load had when charges were introduced:
-- the rate as a linehaul line, as version 1.
insert into public.load_rate_versions
  (organization_id, load_id, version, status, source, charges, total,
   created_by, created_at, reviewed_by, reviewed_at)
select l.organization_id, l.id, 1, 'approved', 'manual',
       jsonb_build_array(jsonb_build_object('kind', 'linehaul', 'description', null, 'amount', l.rate)),
       l.rate, l.created_by, l.created_at, l.created_by, l.created_at
from public.loads l
where l.rate > 0
  and not exists (select 1 from public.load_charges c where c.load_id = l.id)
  and not exists (select 1 from public.load_rate_versions v where v.load_id = l.id);

insert into public.load_charges
  (organization_id, load_id, kind, amount, source, position, created_by, created_at)
select l.organization_id, l.id, 'linehaul', l.rate, 'rate_con', 1, l.created_by, l.created_at
from public.loads l
where l.rate > 0
  and not exists (select 1 from public.load_charges c where c.load_id = l.id);

-- Loads are added with create_load(), which saves the charges with them.
-- Nothing inserts into the table directly, so members no longer can.
drop policy "Members can add loads to their organization" on public.loads;
revoke insert on public.loads from authenticated;
