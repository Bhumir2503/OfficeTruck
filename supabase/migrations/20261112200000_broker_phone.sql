-- A broker's main phone number, as you know it: the number to call back on
-- when a rate con looks like it came from someone posing as the broker.
-- Kept apart from FMCSA's phone, which anyone can change by updating their
-- registration.
alter table public.brokers
  add column phone text check (char_length(phone) <= 30);
