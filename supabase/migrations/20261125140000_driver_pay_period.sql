-- How often each driver is paid: every week (Monday to Sunday), every 2
-- weeks (two of those, counted from a fixed Monday so the blocks don't
-- drift), or every month (the 1st to the last day). A settlement now
-- covers one of those periods: week_start is its first day, and
-- period_end its last. Rows from before this were all single weeks, so
-- they get a week's end.

alter table public.drivers
  add column pay_period text not null default 'week'
    check (pay_period in ('week', 'two_weeks', 'month'));

-- A monthly period starts on the 1st, which isn't always a Monday.
alter table public.driver_settlements
  drop constraint driver_settlements_week_start_check;

alter table public.driver_settlements
  add column period_end date;

update public.driver_settlements
set period_end = week_start + 6
where period_end is null;

alter table public.driver_settlements
  alter column period_end set not null,
  add constraint driver_settlements_period_end_check
    check (period_end >= week_start and period_end < week_start + 31);
