-- Every driver is set up as a CDL holder, so the two non-CDL medical rules
-- (the examiner's certificate, 391.43(g), and the National Registry
-- verification note, 391.23(m)(1)) never apply. End them today, the
-- dated way rules change, instead of deleting them: drivers who already
-- have those items keep them in their history, and the app leaves ended
-- rules' not-applicable items off the checklist.

update public.dq_requirement_templates
set effective_to = '2026-11-18'
where code in ('medical_certificate', 'registry_verification')
  and effective_to = 'infinity';
