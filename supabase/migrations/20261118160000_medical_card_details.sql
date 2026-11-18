-- The rest of the DOT medical card, for the driver page's Medical card
-- card: who examined the driver, their National Registry number, and when
-- the exam was. The expiration date is already on drivers.

alter table public.drivers
  add column medical_examiner_name text
    check (char_length(trim(medical_examiner_name)) between 1 and 120),
  add column medical_examiner_registry_number text
    check (medical_examiner_registry_number ~ '^\d{4,12}$'),
  add column medical_exam_on date,
  add constraint drivers_medical_exam_before_expiry
    check (medical_exam_on is null or medical_card_expires_on is null
      or medical_exam_on <= medical_card_expires_on);
