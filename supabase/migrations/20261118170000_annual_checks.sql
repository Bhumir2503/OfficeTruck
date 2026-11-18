-- The two yearly checks on every CDL driver, kept on the driver so the
-- driver page can record them now that the qualification file isn't on
-- screen: the annual review of their driving record (391.25) and the
-- limited Clearinghouse query (382.701). Each is due again a year after
-- the last one. When unset, due dates still come from the qualification
-- file.

alter table public.drivers
  add column last_annual_review_on date,
  add column last_clearinghouse_query_on date;
