-- More kinds of driver paperwork: work eligibility, direct deposit, TWIC,
-- passport, owner-operator lease and insurance, training, policy
-- acknowledgments, accident reports and tickets. Keep in step with
-- DRIVER_DOCUMENT_KINDS in lib/driver-document-format.ts.

alter table public.driver_documents
  drop constraint driver_documents_kind_check;

alter table public.driver_documents
  add constraint driver_documents_kind_check check (kind in (
    'cdl', 'medical_card', 'mvr', 'drug_test', 'application', 'road_test',
    'clearinghouse', 'w9', 'i9', 'direct_deposit', 'twic', 'passport',
    'lease_agreement', 'insurance', 'training', 'policy_ack',
    'accident_report', 'citation', 'other'
  ));

-- A W-9 doesn't expire: drop any date one was saved with, so it isn't
-- flagged as running out.
update public.driver_documents
set expires_on = null
where kind = 'w9' and expires_on is not null;
