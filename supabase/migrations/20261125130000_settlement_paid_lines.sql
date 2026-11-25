-- A paid week froze its totals and which loads it paid, but its lines were
-- read live from the loads: change a paid load's miles or add an expense
-- to it and the statement's lines stopped adding up to what was paid.
-- Keep the lines as they were paid too ({ loads, expenses }), so a paid
-- statement shows exactly what was paid. Null while open, and for weeks
-- paid before this, which still show live lines.

alter table public.driver_settlements
  add column paid_lines jsonb
    check (paid_lines is null or jsonb_typeof(paid_lines) = 'object');

alter table public.driver_settlements
  add constraint driver_settlements_paid_lines_only_when_paid
    check (paid_lines is null or status = 'paid');
