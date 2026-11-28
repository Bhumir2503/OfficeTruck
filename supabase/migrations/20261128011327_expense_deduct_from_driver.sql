-- An expense the company pays and takes off the driver's settlement, for
-- owner-operators who run on their own fuel: the company fronts it with its
-- card, and the driver pays it back out of their pay. paid_by = 'deduct'.
--
-- The driver app reads paid_by as text and treats anything but 'company' as
-- not company-paid; it doesn't list these (only the driver's own and the
-- ones they added), so nothing there changes. The deduction shows on the
-- pay statement.

alter table public.load_expenses
  drop constraint load_expenses_paid_by_check;

alter table public.load_expenses
  add constraint load_expenses_paid_by_check
  check (paid_by in ('company', 'driver', 'deduct'));
