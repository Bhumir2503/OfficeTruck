-- The investigation file must show the previous-employer inquiry was made
-- (391.23), but a driver with no DOT-regulated employer in the past 3
-- years (a new CDL holder, say) has no one to contact. Record that as its
-- own entry in the contact log: outcome no_previous_employers, with no
-- employer or contact method, and an optional note on how it was
-- confirmed (in response_summary). Every other entry still needs both.

alter table public.dq_employer_checks
  alter column employer_name drop not null,
  alter column method drop not null,
  drop constraint dq_employer_checks_outcome_check,
  add constraint dq_employer_checks_outcome_check check (outcome in (
    'response_received', 'no_response', 'declined', 'no_record_of_driver',
    'attempt_failed', 'no_previous_employers'
  )),
  add constraint dq_employer_checks_none_has_no_employer check (
    (outcome = 'no_previous_employers')
      = (employer_name is null and method is null)
  );
