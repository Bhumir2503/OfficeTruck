-- DQ file rules, step 1: the checklist templates, from the Required items
-- table and the two restricted files in docs/dq-file-spec.md.
--
-- Rules that changed on June 23, 2025 (medical proof for CDL drivers, and
-- the registry note only for non-CDL drivers) start on that date. Earlier
-- versions aren't seeded; the checklist is built from today's rules. To
-- change a rule, end its row (effective_to) and add the new one.
--
-- No "annual list of violations" item (391.27): it isn't in the current
-- 391.51(b). No paper medical card grace periods are seeded either: every
-- state defaults to 0 days until the current status is confirmed.
--
-- The citations for 391.21, 391.23 and 391.25 haven't been checked against
-- the rule text yet (see the spec's Sources). This isn't legal advice.

insert into public.dq_requirement_templates (
  code, title, description, cfr_ref, file_type, applies_to,
  due_rule, due_offset_days, due_offset_hours, recurrence_months,
  max_validity_months, per_state, paired_code, evidence, attestation_type,
  retention_rule, retention_years, sort_order, effective_from
)
values
  -- The standard DQ file (391.51(b)).
  (
    'employment_application',
    'Employment application, signed and dated',
    'Filled in and signed by the driver.',
    '391.21', 'dq', 'all',
    'before_first_trip', null, null, null,
    null, false, null, 'attestation', 'employment_application',
    'employment_plus_years', 3, 10, '-infinity'
  ),
  (
    'hire_mvr',
    'Driving record (MVR) from each state that licensed the driver in the past 3 years',
    'One per state.',
    '391.23(a)(1)', 'dq', 'all',
    'days_after_start', 30, null, null,
    null, true, null, 'document', null,
    'employment_plus_years', 3, 20, '-infinity'
  ),
  (
    'road_test',
    'Road test certificate, or a copy of the CDL accepted in its place',
    null,
    '391.31, 391.33', 'dq', 'all',
    'before_first_trip', null, null, null,
    null, false, null, 'document', null,
    'employment_plus_years', 3, 30, '-infinity'
  ),
  (
    'annual_mvr',
    'Annual driving record (MVR)',
    null,
    '391.25(a)', 'dq', 'all',
    'months_after_start', null, null, 12,
    null, false, null, 'document', null,
    'from_item_years', 3, 40, '-infinity'
  ),
  (
    'annual_review',
    'Annual review note',
    'Reviewer''s name, the date, and a signed statement that the MVR was reviewed.',
    '391.25(c)(2)', 'dq', 'all',
    'with_paired', null, null, 12,
    null, false, 'annual_mvr', 'attestation', 'annual_review',
    'from_item_years', 3, 50, '-infinity'
  ),
  (
    'medical_proof_cdl',
    'Medical proof: MVR showing current medical certification status',
    'For CDL and CLP holders. Due again when the certification runs out.',
    '391.51(b)(6)(ii)', 'dq', 'cdl',
    'before_first_trip', null, null, null,
    24, false, null, 'document', null,
    'from_item_years', 3, 60, '2025-06-23'
  ),
  (
    'medical_certificate',
    'Medical examiner''s certificate',
    'For non-CDL drivers. Due again when it runs out; store the date printed on it.',
    '391.43(g)', 'dq', 'non_cdl',
    'before_first_trip', null, null, null,
    24, false, null, 'document', null,
    'from_item_years', 3, 61, '2025-06-23'
  ),
  (
    'medical_variance',
    'Medical variance, Skill Performance Evaluation certificate or exemption letter',
    'Only for drivers who hold one. Kept with the medical proof; replace it when renewed.',
    '391.49, part 381', 'dq', 'conditional',
    'before_first_trip', null, null, null,
    null, false, null, 'document', null,
    'from_item_years', 3, 70, '-infinity'
  ),
  (
    'registry_verification',
    'Note that the medical examiner was verified on the National Registry',
    'For non-CDL drivers, at each medical exam.',
    '391.23(m)(1)', 'dq', 'non_cdl',
    'with_paired', null, null, null,
    null, false, 'medical_certificate', 'attestation', 'registry_verification',
    'from_item_years', 3, 80, '2025-06-23'
  ),

  -- The investigation file (safety performance history). Owners and admins only.
  (
    'investigation_authorization',
    'Driver''s written authorization to contact previous employers',
    null,
    '391.23(c), 391.53', 'investigation', 'all',
    'days_after_start', 30, null, null,
    null, false, null, 'document', null,
    'employment_plus_years', 3, 110, '-infinity'
  ),
  (
    'previous_employer_checks',
    'Previous-employer checks for the past 3 years',
    'Every contact and every failed attempt, logged.',
    '391.23(c), 391.53', 'investigation', 'all',
    'days_after_start', 30, null, null,
    null, false, null, 'contact_log', null,
    'employment_plus_years', 3, 120, '-infinity'
  ),

  -- The drug and alcohol file (part 382, CDL drivers). Owners and admins only.
  (
    'pre_employment_drug_test',
    'Pre-employment drug test result',
    null,
    'part 382', 'drug_alcohol', 'cdl',
    'before_first_trip', null, null, null,
    null, false, null, 'document', null,
    'no_auto_delete', null, 210, '-infinity'
  ),
  (
    'clearinghouse_full_query',
    'Clearinghouse full query, before the first trip',
    'Needs the driver''s consent given inside the Clearinghouse. Upload the result.',
    'part 382', 'drug_alcohol', 'cdl',
    'before_first_trip', null, null, null,
    null, false, null, 'document', null,
    'no_auto_delete', null, 220, '-infinity'
  ),
  (
    'clearinghouse_consent',
    'Signed general consent for limited queries',
    'Kept outside the Clearinghouse. One form can cover several years.',
    'part 382', 'drug_alcohol', 'cdl',
    'with_paired', null, null, null,
    null, false, 'clearinghouse_limited_query', 'document', null,
    'no_auto_delete', null, 230, '-infinity'
  ),
  (
    'clearinghouse_limited_query',
    'Annual Clearinghouse limited query',
    'Within 12 months of the last query. Upload the result.',
    'part 382', 'drug_alcohol', 'cdl',
    'months_after_start', null, null, 12,
    null, false, null, 'document', null,
    'no_auto_delete', null, 240, '-infinity'
  ),
  (
    'clearinghouse_escalation_query',
    'Full query after a limited query found a record',
    'Due within 24 hours, or the driver comes off the road.',
    'part 382', 'drug_alcohol', 'conditional',
    'hours_after_trigger', null, 24, null,
    null, false, null, 'document', null,
    'no_auto_delete', null, 250, '-infinity'
  );
