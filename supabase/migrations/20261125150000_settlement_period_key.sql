-- A pay period is its first and last day, not just its first: after a
-- driver's schedule changes, an old paid week (Nov 16-22) and a new
-- 2-week period (Nov 16-29) start the same day but are different periods,
-- and both need their own row.

alter table public.driver_settlements
  drop constraint driver_settlements_organization_id_driver_id_week_start_key;

alter table public.driver_settlements
  add constraint driver_settlements_period_key
    unique (organization_id, driver_id, week_start, period_end);
