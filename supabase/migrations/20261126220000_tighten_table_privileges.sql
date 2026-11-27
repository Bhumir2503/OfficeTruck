-- New tables come with every privilege for signed-in users by default.
-- The broker update and rate con inbox tables (20261126180000,
-- 20261126210000) kept them; row-level security already kept other
-- companies out, but members could change more of a rate con inbox item
-- than its status and load. Take the defaults back and grant only what's
-- used.

revoke all on table public.broker_updates from anon, authenticated;
grant select on public.broker_updates to authenticated;

revoke all on table public.rate_con_inbox from anon, authenticated;
grant select on public.rate_con_inbox to authenticated;
grant update (status, load_id) on public.rate_con_inbox to authenticated;
