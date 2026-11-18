-- Row-level security for DQ files. Runs with `npx supabase test db`, which
-- needs the local Supabase stack (Docker). Everything runs in one
-- transaction that's rolled back.
--
-- Organization A: an owner, a member, and a driver who signs in.
-- Organization B: an owner. Nobody in B may read or write A's rows.

begin;
create extension if not exists pgtap with schema extensions;

select plan(42);

-- ------------------------------------------------------------- Setup -----

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'member-a@test.local', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'driver-a@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated');

-- Signs in with an SMS code for the number organization A set on a driver.
insert into auth.users (id, phone, phone_confirmed_at, aud, role) values
  ('cccccccc-0000-0000-0000-000000000001', '15550001111', now(), 'authenticated', 'authenticated');

insert into public.organizations (id, name, slug) values
  ('0a000000-0000-0000-0000-00000000000a', 'Org A', 'dq-test-a'),
  ('0b000000-0000-0000-0000-00000000000b', 'Org B', 'dq-test-b');

insert into public.organization_users (organization_id, user_id, role) values
  ('0a000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'owner'),
  ('0a000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000002', 'member'),
  ('0b000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000001', 'owner');

insert into public.drivers (id, organization_id, full_name, license_class, user_id, login_phone) values
  ('d0000000-0000-0000-0000-0000000000a1', '0a000000-0000-0000-0000-00000000000a', 'Driver A1', 'cdl', 'aaaaaaaa-0000-0000-0000-000000000003', null),
  ('d0000000-0000-0000-0000-0000000000a2', '0a000000-0000-0000-0000-00000000000a', 'Driver A2', 'non_cdl', null, null),
  ('d0000000-0000-0000-0000-0000000000a3', '0a000000-0000-0000-0000-00000000000a', 'Driver A3', 'cdl', null, '+15550001111'),
  ('d0000000-0000-0000-0000-0000000000b1', '0b000000-0000-0000-0000-00000000000b', 'Driver B1', 'cdl', null, null);

insert into public.dq_items (id, organization_id, driver_id, template_id) values
  ('10000000-0000-0000-0000-0000000000a1', '0a000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000a1',
    (select id from public.dq_requirement_templates where code = 'employment_application')),
  ('10000000-0000-0000-0000-0000000000a2', '0a000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000a1',
    (select id from public.dq_requirement_templates where code = 'investigation_authorization')),
  ('10000000-0000-0000-0000-0000000000a3', '0a000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000a1',
    (select id from public.dq_requirement_templates where code = 'pre_employment_drug_test')),
  ('10000000-0000-0000-0000-0000000000a4', '0a000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000a2',
    (select id from public.dq_requirement_templates where code = 'road_test')),
  ('10000000-0000-0000-0000-0000000000b1', '0b000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-0000000000b1',
    (select id from public.dq_requirement_templates where code = 'road_test'));

insert into public.dq_documents (id, organization_id, dq_item_id, storage_path, source, file_name, content_type, size_bytes) values
  ('20000000-0000-0000-0000-0000000000a1', '0a000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1',
    '0a000000-0000-0000-0000-00000000000a/d0000000-0000-0000-0000-0000000000a1/dq/application.pdf', 'upload', 'application.pdf', 'application/pdf', 1000),
  ('20000000-0000-0000-0000-0000000000b1', '0b000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-0000000000b1',
    '0b000000-0000-0000-0000-00000000000b/d0000000-0000-0000-0000-0000000000b1/dq/road-test.pdf', 'upload', 'road-test.pdf', 'application/pdf', 1000);

insert into public.dq_attestations (organization_id, dq_item_id, type, signer_id, signer_name, signer_role, statement_text) values
  ('0a000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1', 'annual_review',
    'aaaaaaaa-0000-0000-0000-000000000001', 'Owner A', 'owner', 'I reviewed this driver''s driving record.');

insert into public.dq_employer_checks (organization_id, driver_id, employer_name, contacted_at, method, outcome) values
  ('0a000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000a1', 'Old Carrier LLC', now() - interval '1 day', 'phone', 'no_response');

insert into public.dq_employment_applications (organization_id, dq_item_id, ssn_ciphertext, ssn_last4) values
  ('0a000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1', 'v1.k1.aaaa.bbbb.cccc', '6789');

insert into storage.objects (bucket_id, name) values
  ('dq-files', '0a000000-0000-0000-0000-00000000000a/d0000000-0000-0000-0000-0000000000a1/dq/application.pdf'),
  ('dq-files', '0a000000-0000-0000-0000-00000000000a/d0000000-0000-0000-0000-0000000000a1/investigation/authorization.pdf'),
  ('dq-files', '0b000000-0000-0000-0000-00000000000b/d0000000-0000-0000-0000-0000000000b1/dq/road-test.pdf');

-- ---------------------------------------- Organization B's owner -----

set local role authenticated;
set local request.jwt.claims to '{"sub": "bbbbbbbb-0000-0000-0000-000000000001", "role": "authenticated"}';

select is((select count(*) from public.dq_requirement_templates)::int, 16, 'Anyone signed in reads the shared rules');
select is((select count(*) from public.dq_items)::int, 1, 'B sees only its own item');
select is_empty($$ select 1 from public.dq_items where organization_id = '0a000000-0000-0000-0000-00000000000a' $$, 'B can''t read A''s items');
select is_empty($$ select 1 from public.dq_documents where organization_id = '0a000000-0000-0000-0000-00000000000a' $$, 'B can''t read A''s documents');
select is_empty($$ select 1 from public.dq_attestations where organization_id = '0a000000-0000-0000-0000-00000000000a' $$, 'B can''t read A''s signed records');
select is_empty($$ select 1 from public.dq_employer_checks where organization_id = '0a000000-0000-0000-0000-00000000000a' $$, 'B can''t read A''s employer checks');
select is_empty($$ select 1 from public.dq_employment_applications where organization_id = '0a000000-0000-0000-0000-00000000000a' $$, 'B can''t read A''s applications');
select is_empty($$ select 1 from public.dq_audit_log where organization_id = '0a000000-0000-0000-0000-00000000000a' $$, 'B can''t read A''s history');
select is_empty($$ select 1 from storage.objects where bucket_id = 'dq-files' and name like '0a000000-%' $$, 'B can''t read A''s files');

select throws_ok(
  $$ insert into public.dq_items (organization_id, driver_id, template_id)
     values ('0a000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000a2',
       (select id from public.dq_requirement_templates where code = 'hire_mvr')) $$,
  '42501', null, 'B can''t add items to A');
select is_empty(
  $$ update public.dq_items set due_date = '2030-01-01'
     where id = '10000000-0000-0000-0000-0000000000a1' returning id $$,
  'B can''t update A''s items');
select is_empty(
  $$ update public.dq_documents set confirmed_at = now()
     where id = '20000000-0000-0000-0000-0000000000a1' returning id $$,
  'B can''t confirm A''s documents');
select throws_ok(
  $$ insert into public.dq_documents (organization_id, dq_item_id, storage_path, source, file_name, content_type, size_bytes)
     values ('0a000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1',
       '0a000000-0000-0000-0000-00000000000a/d0000000-0000-0000-0000-0000000000a1/dq/b.pdf', 'upload', 'b.pdf', 'application/pdf', 10) $$,
  null, null, 'B can''t add documents to A''s items');
select throws_ok(
  $$ insert into public.dq_employer_checks (organization_id, driver_id, employer_name, contacted_at, method, outcome)
     values ('0a000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000a1', 'X', now(), 'phone', 'no_response') $$,
  '42501', null, 'B can''t log checks on A''s drivers');
select throws_ok(
  $$ insert into public.dq_attestations (organization_id, dq_item_id, type, signer_name, signer_role, statement_text)
     values ('0a000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1', 'annual_review', 'B', 'owner', 'I reviewed this record.') $$,
  null, null, 'B can''t sign A''s records');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('dq-files', '0a000000-0000-0000-0000-00000000000a/d0000000-0000-0000-0000-0000000000a1/dq/b.pdf') $$,
  '42501', null, 'B can''t upload into A''s folder');

-- ---------------------------------------- Organization A's owner -----

set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';

select is((select count(*) from public.dq_items where driver_id = 'd0000000-0000-0000-0000-0000000000a1')::int, 3,
  'The owner sees all three files');
select throws_ok(
  $$ delete from public.dq_documents where id = '20000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'Documents can''t be deleted');
select throws_ok(
  $$ insert into public.dq_documents (organization_id, dq_item_id, storage_path, source, file_name, content_type, size_bytes, issue_date)
     values ('0a000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1',
       '0a000000-0000-0000-0000-00000000000a/d0000000-0000-0000-0000-0000000000a1/dq/dated.pdf', 'upload', 'dated.pdf', 'application/pdf', 10, '2026-01-01') $$,
  '23514', null, 'A date can''t be saved without a confirmation');
select lives_ok(
  $$ update public.dq_documents set issue_date = '2026-01-01', confirmed_at = now()
     where id = '20000000-0000-0000-0000-0000000000a1' $$,
  'The owner confirms a document');
select is(
  (select confirmed_by from public.dq_documents where id = '20000000-0000-0000-0000-0000000000a1'),
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  'The confirmation is recorded as the owner');
update public.drivers set user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  where id = 'd0000000-0000-0000-0000-0000000000a2';
select is(
  (select user_id from public.drivers where id = 'd0000000-0000-0000-0000-0000000000a2'),
  null::uuid, 'The office can''t link a login to a driver by hand');

-- ---------------------------------------- Organization A's member -----

set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-0000-0000-000000000002", "role": "authenticated"}';

select is((select count(*) from public.dq_items)::int, 2, 'A member sees the standard DQ file only');
select is_empty($$ select 1 from public.dq_items where file_type <> 'dq' $$, 'A member can''t see the restricted files');
select is_empty($$ select 1 from public.dq_employer_checks $$, 'A member can''t see employer checks');
select is_empty($$ select 1 from public.dq_employment_applications $$, 'A member can''t read application answers');
select throws_ok(
  $$ insert into public.dq_items (organization_id, driver_id, template_id)
     values ('0a000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000a2',
       (select id from public.dq_requirement_templates where code = 'hire_mvr')) $$,
  '42501', null, 'A member can''t add items');
select is((select count(*) from storage.objects where bucket_id = 'dq-files')::int, 1, 'A member reads only standard DQ files');

-- ------------------------------------------ Organization A's driver -----

set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-0000-0000-000000000003", "role": "authenticated"}';

select is((select count(*) from public.dq_items)::int, 1, 'The driver sees their own standard items only');
select is_empty($$ select 1 from public.drivers $$, 'The driver can''t read the drivers list');
select lives_ok(
  $$ insert into public.dq_documents (organization_id, dq_item_id, storage_path, source, file_name, content_type, size_bytes)
     values ('0a000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1',
       '0a000000-0000-0000-0000-00000000000a/d0000000-0000-0000-0000-0000000000a1/dq/photo.jpg', 'upload', 'photo.jpg', 'image/jpeg', 10) $$,
  'The driver uploads to their own item');
select throws_ok(
  $$ insert into public.dq_documents (organization_id, dq_item_id, storage_path, source, file_name, content_type, size_bytes)
     values ('0a000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a2',
       '0a000000-0000-0000-0000-00000000000a/d0000000-0000-0000-0000-0000000000a1/investigation/x.pdf', 'upload', 'x.pdf', 'application/pdf', 10) $$,
  null, null, 'The driver can''t upload to the investigation file');
select is_empty(
  $$ update public.dq_items set completed_at = now()
     where id = '10000000-0000-0000-0000-0000000000a1' returning id $$,
  'The driver can''t complete an item');
update public.dq_documents set confirmed_at = now(), issue_date = '2026-01-01'
  where storage_path like '%/dq/photo.jpg';
select is(
  (select confirmed_at from public.dq_documents where storage_path like '%/dq/photo.jpg'),
  null::timestamptz, 'The driver can''t confirm their own upload');
select is((select count(*) from storage.objects where bucket_id = 'dq-files')::int, 1, 'The driver reads only their standard files');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('dq-files', '0a000000-0000-0000-0000-00000000000a/d0000000-0000-0000-0000-0000000000a1/investigation/x.pdf') $$,
  '42501', null, 'The driver can''t upload into the investigation folder');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('dq-files', '0a000000-0000-0000-0000-00000000000a/d0000000-0000-0000-0000-0000000000a1/dq/photo.jpg') $$,
  'The driver uploads a photo into their own folder');

-- ---------------------------------------------------- Phone sign-in -----

set local request.jwt.claims to '{"sub": "cccccccc-0000-0000-0000-000000000001", "role": "authenticated"}';

select is(public.claim_driver_logins(), 1, 'A verified phone number claims the matching driver');
select ok(
  public.is_dq_driver('0a000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000a3'),
  'and is then signed in as that driver');

-- ---------------------------------------------- History and freezing -----

reset role;

select ok(
  exists (select 1 from public.dq_audit_log where entity = 'dq_documents'
    and entity_id = '20000000-0000-0000-0000-0000000000a1' and action = 'update'
    and actor_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'The confirmation is in the history, with who did it');
select ok(
  not exists (select 1 from public.dq_audit_log where entity = 'dq_employment_applications'
    and (after ? 'ssn_ciphertext' or after::text like '%v1.k1.%')),
  'The history never holds the encrypted SSN');

update public.drivers set end_date = '2020-01-01' where id = 'd0000000-0000-0000-0000-0000000000a2';
set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.dq_items (organization_id, driver_id, template_id)
     values ('0a000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000a2',
       (select id from public.dq_requirement_templates where code = 'hire_mvr')) $$,
  '42501', 'This driver has left; their file is read-only.', 'A driver''s file is frozen after they leave');

select * from finish();
rollback;
