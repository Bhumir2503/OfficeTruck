-- 20261118120000 ended the two non-CDL medical rules on 2026-11-18, but
-- the app's "today" is the server's local date, still the 17th, and
-- effective_to is the first day a rule no longer applies. End them on the
-- 17th so they're out of effect now.

update public.dq_requirement_templates
set effective_to = '2026-11-17'
where code in ('medical_certificate', 'registry_verification')
  and effective_to = '2026-11-18';
