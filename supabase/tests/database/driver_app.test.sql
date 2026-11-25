-- What a signed-in driver can see and do from the driver app. Runs with
-- `npx supabase test db` (needs the local Supabase stack). Everything runs
-- in one transaction that's rolled back.
--
-- Organization A doesn't share rates with drivers.
--   Driver 1 (per mile): a dispatched load L1 and a booked load L2.
--   Driver 2: a dispatched load L3.
--   Driver 3 (percent of the load): a dispatched load L4.

begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

-- ------------------------------------------------------------- Setup -----

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-1000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('aaaaaaaa-1000-0000-0000-000000000011', 'driver-1@test.local', 'authenticated', 'authenticated'),
  ('aaaaaaaa-1000-0000-0000-000000000012', 'driver-2@test.local', 'authenticated', 'authenticated'),
  ('aaaaaaaa-1000-0000-0000-000000000013', 'driver-3@test.local', 'authenticated', 'authenticated');

insert into public.organizations (id, name, slug) values
  ('0a100000-0000-0000-0000-00000000000a', 'Org A', 'driver-app-test-a');

insert into public.organization_users (organization_id, user_id, role) values
  ('0a100000-0000-0000-0000-00000000000a', 'aaaaaaaa-1000-0000-0000-000000000001', 'owner');

insert into public.drivers (id, organization_id, full_name, license_class, user_id, pay_type, pay_rate) values
  ('d1000000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-00000000000a', 'Driver One', 'cdl',
    'aaaaaaaa-1000-0000-0000-000000000011', 'per_mile', 0.6),
  ('d1000000-0000-0000-0000-000000000002', '0a100000-0000-0000-0000-00000000000a', 'Driver Two', 'cdl',
    'aaaaaaaa-1000-0000-0000-000000000012', 'per_mile', 0.6),
  ('d1000000-0000-0000-0000-000000000003', '0a100000-0000-0000-0000-00000000000a', 'Driver Three', 'cdl',
    'aaaaaaaa-1000-0000-0000-000000000013', 'percent', 25);

insert into public.loads (id, organization_id, reference, broker_name, pickup_location, pickup_start,
  delivery_location, delivery_start, rate, status, driver_id) values
  ('11000000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-00000000000a', 'L1', 'Broker',
    'Dallas, TX', now()::timestamp, 'Atlanta, GA', now()::timestamp + interval '1 day', 2000, 'dispatched',
    'd1000000-0000-0000-0000-000000000001'),
  ('11000000-0000-0000-0000-000000000002', '0a100000-0000-0000-0000-00000000000a', 'L2', 'Broker',
    'Dallas, TX', now()::timestamp, 'Atlanta, GA', now()::timestamp + interval '1 day', 2000, 'booked',
    'd1000000-0000-0000-0000-000000000001'),
  ('11000000-0000-0000-0000-000000000003', '0a100000-0000-0000-0000-00000000000a', 'L3', 'Broker',
    'Dallas, TX', now()::timestamp, 'Atlanta, GA', now()::timestamp + interval '1 day', 2000, 'dispatched',
    'd1000000-0000-0000-0000-000000000002'),
  ('11000000-0000-0000-0000-000000000004', '0a100000-0000-0000-0000-00000000000a', 'L4', 'Broker',
    'Dallas, TX', now()::timestamp, 'Atlanta, GA', now()::timestamp + interval '1 day', 2000, 'dispatched',
    'd1000000-0000-0000-0000-000000000003');

insert into public.load_stops (id, organization_id, load_id, position, kind, location, appointment_start) values
  ('51000000-0000-0000-0000-000000000011', '0a100000-0000-0000-0000-00000000000a',
    '11000000-0000-0000-0000-000000000001', 1, 'pickup', 'Dallas, TX', now()::timestamp),
  ('51000000-0000-0000-0000-000000000012', '0a100000-0000-0000-0000-00000000000a',
    '11000000-0000-0000-0000-000000000001', 2, 'delivery', 'Atlanta, GA', now()::timestamp + interval '1 day'),
  ('51000000-0000-0000-0000-000000000031', '0a100000-0000-0000-0000-00000000000a',
    '11000000-0000-0000-0000-000000000003', 1, 'pickup', 'Dallas, TX', now()::timestamp);

insert into public.load_documents (organization_id, load_id, kind, path, file_name, content_type, size_bytes) values
  ('0a100000-0000-0000-0000-00000000000a', '11000000-0000-0000-0000-000000000001', 'rate_con',
    '0a100000-0000-0000-0000-00000000000a/11000000-0000-0000-0000-000000000001/ratecon.pdf',
    'ratecon.pdf', 'application/pdf', 1000);

-- Uploaded by the driver through storage, as the app does before adding it.
insert into storage.objects (bucket_id, name, owner_id) values
  ('load-documents', '0a100000-0000-0000-0000-00000000000a/11000000-0000-0000-0000-000000000001/pod.pdf',
    'aaaaaaaa-1000-0000-0000-000000000011');

-- A paid statement for driver 1 and driver 3, with the load's rate in the lines.
insert into public.driver_settlements (id, organization_id, driver_id, week_start, period_end, status,
  paid_on, load_ids, gross_pay, reimbursements, adjustments, net_pay, paid_lines) values
  ('5e100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-00000000000a',
    'd1000000-0000-0000-0000-000000000001', '2026-11-16', '2026-11-22', 'paid', '2026-11-24',
    array['11000000-0000-0000-0000-000000000001']::uuid[], 600, 0, 0, 600,
    '{"loads": [{"id": "11000000-0000-0000-0000-000000000001", "reference": "L1", "rate": 2000, "miles": 1000, "pay": 600}], "expenses": []}'),
  ('5e100000-0000-0000-0000-000000000003', '0a100000-0000-0000-0000-00000000000a',
    'd1000000-0000-0000-0000-000000000003', '2026-11-16', '2026-11-22', 'paid', '2026-11-24',
    array['11000000-0000-0000-0000-000000000004']::uuid[], 500, 0, 0, 500,
    '{"loads": [{"id": "11000000-0000-0000-0000-000000000004", "reference": "L4", "rate": 2000, "miles": 1000, "pay": 500}], "expenses": []}');

-- --------------------------------------------------------- Driver 1 -----

set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-1000-0000-0000-000000000011", "role": "authenticated"}';

select is(jsonb_array_length(public.my_loads()), 1, 'A driver sees only loads sent to them');
select is(public.my_loads() -> 0 ->> 'reference', 'L1', 'The booked load isn''t listed yet');
select is((select count(*)::int from public.loads), 0, 'A driver can''t read the loads table');
select is((select count(*)::int from public.load_stops), 0, 'A driver can''t read the stops table');

select is(public.my_load('11000000-0000-0000-0000-000000000001') ->> 'reference', 'L1', 'A driver opens their load');
select is(public.my_load('11000000-0000-0000-0000-000000000001') ->> 'rate', null, 'No rate for a per-mile driver');
select is(jsonb_array_length(public.my_load('11000000-0000-0000-0000-000000000001') -> 'documents'), 0,
  'The rate con is hidden from a per-mile driver');
select is(public.my_load('11000000-0000-0000-0000-000000000001') -> 'driver_pay' ->> 'type', 'per_mile',
  'A driver sees their own pay on the load');
select throws_ok($$ select public.my_load('11000000-0000-0000-0000-000000000003') $$,
  'P0002', null, 'Another driver''s load is not found');
select throws_ok($$ select public.my_load('11000000-0000-0000-0000-000000000002') $$,
  'P0002', null, 'A booked load is not found');

-- Check-ins.
select lives_ok($$ select public.record_my_stop_event('51000000-0000-0000-0000-000000000011', 'arrived',
  now() - interval '1 hour') $$,
  'A driver checks in with the time they tapped');
select is(public.my_load('11000000-0000-0000-0000-000000000001') -> 'stops' -> 0 ->> 'arrived_source', 'driver',
  'The check-in is marked as from the driver');
select lives_ok($$ select public.record_my_stop_event('51000000-0000-0000-0000-000000000011', 'arrived',
  (public.my_load('11000000-0000-0000-0000-000000000001') -> 'stops' -> 0 ->> 'arrived_at')::timestamptz) $$,
  'Sending the same tap again is accepted');
select throws_ok($$ select public.record_my_stop_event('51000000-0000-0000-0000-000000000011', 'arrived', now()) $$,
  '22023', 'Arrival is already recorded.', 'A different arrival time is refused');
select throws_ok($$ select public.record_my_stop_event('51000000-0000-0000-0000-000000000011', 'departed',
  now() - interval '2 days') $$,
  '22023', null, 'A tap more than a day old is refused');
select lives_ok($$ select public.record_my_stop_event('51000000-0000-0000-0000-000000000011', 'departed', now(), 120500) $$,
  'A driver departs with an odometer reading');
select is(public.my_load('11000000-0000-0000-0000-000000000001') ->> 'status', 'loaded',
  'Leaving the last pickup marks the load loaded');
select is((public.my_load('11000000-0000-0000-0000-000000000001') -> 'stops' -> 0 ->> 'departed_odometer')::int, 120500,
  'The odometer is saved');
select throws_ok($$ select public.record_my_stop_event('51000000-0000-0000-0000-000000000031', 'arrived') $$,
  'P0002', null, 'A driver can''t check in on another driver''s load');

-- Paperwork and expenses.
select throws_ok($$ select public.add_my_load_document('11000000-0000-0000-0000-000000000001', 'rate_con',
  '0a100000-0000-0000-0000-00000000000a/11000000-0000-0000-0000-000000000001/pod.pdf', 'pod.pdf', 'application/pdf', 1000) $$,
  '22023', null, 'A driver can''t add a rate con');
select throws_ok($$ select public.add_my_load_document('11000000-0000-0000-0000-000000000001', 'pod',
  '0a100000-0000-0000-0000-00000000000a/11000000-0000-0000-0000-000000000001/missing.pdf', 'missing.pdf', 'application/pdf', 1000) $$,
  'P0002', null, 'A document needs its file uploaded first');
select lives_ok($$ select public.add_my_load_document('11000000-0000-0000-0000-000000000001', 'pod',
  '0a100000-0000-0000-0000-00000000000a/11000000-0000-0000-0000-000000000001/pod.pdf', 'pod.pdf', 'application/pdf', 1000) $$,
  'A driver adds a POD');
select is(public.my_load('11000000-0000-0000-0000-000000000001') ->> 'status', 'delivered',
  'The POD marks the load delivered');
select lives_ok($$ select public.add_my_expense('11000000-0000-0000-0000-000000000001', 'fuel', 412.50, current_date,
  'Pilot #312', null, null, null, 'e1000000-0000-0000-0000-000000000001') $$,
  'A driver adds an expense');
select is(public.add_my_expense('11000000-0000-0000-0000-000000000001', 'fuel', 412.50, current_date,
  'Pilot #312', null, null, null, 'e1000000-0000-0000-0000-000000000001'),
  'e1000000-0000-0000-0000-000000000001'::uuid, 'Sending the same expense again doesn''t add it twice');
select is(jsonb_array_length(public.my_load('11000000-0000-0000-0000-000000000001') -> 'expenses'), 1,
  'The expense is on the load, paid by the driver');

-- Pay.
select is(jsonb_array_length(public.my_settlements()), 1, 'A driver sees only their own statements');
select ok(not (public.my_settlement('5e100000-0000-0000-0000-000000000001') -> 'loads' -> 0 ? 'rate'),
  'The load rate is taken out of a per-mile driver''s statement');

-- --------------------------------------------------------- Driver 3 -----

set local request.jwt.claims to '{"sub": "aaaaaaaa-1000-0000-0000-000000000013", "role": "authenticated"}';

select isnt(public.my_load('11000000-0000-0000-0000-000000000004') ->> 'rate', null,
  'A percent driver sees the rate');
select ok(public.my_settlement('5e100000-0000-0000-0000-000000000003') -> 'loads' -> 0 ? 'rate',
  'A percent driver''s statement keeps the rate');

select * from finish();
rollback;
