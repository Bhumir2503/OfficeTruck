-- DQ rules, step 2: three facts the rules engine needs, kept as data like
-- the rest of the rules instead of in code.
--
--   * follows_paired: the item comes round again each time its paired item
--     does (the annual review with each annual MVR, the registry note with
--     each medical certificate).
--   * applies_when: for conditional items, the driver fact that makes them
--     apply (holds_medical_variance for item 7).
--   * trigger_code and trigger_result: for items another item's result
--     creates. A limited Clearinghouse query that finds a record requires a
--     full query within 24 hours.

alter table public.dq_requirement_templates
  add column follows_paired boolean not null default false,
  add column applies_when text check (applies_when in ('holds_medical_variance')),
  add column trigger_code text check (trigger_code ~ '^[a-z][a-z0-9_]{1,59}$'),
  add column trigger_result text check (trigger_result in ('record_found'));

update public.dq_requirement_templates
set follows_paired = true
where code in ('annual_review', 'registry_verification');

update public.dq_requirement_templates
set applies_when = 'holds_medical_variance'
where code = 'medical_variance';

update public.dq_requirement_templates
set trigger_code = 'clearinghouse_limited_query', trigger_result = 'record_found'
where code = 'clearinghouse_escalation_query';

alter table public.dq_requirement_templates
  add constraint dq_requirement_templates_follows_paired
    check (not follows_paired or paired_code is not null),
  add constraint dq_requirement_templates_trigger
    check (
      (due_rule = 'hours_after_trigger')
      = (trigger_code is not null and trigger_result is not null)
    ),
  add constraint dq_requirement_templates_conditional
    check (
      (applies_to = 'conditional')
      = (applies_when is not null or trigger_code is not null)
    );
