-- DQ files: table rights that match the design. Supabase gives anon and
-- authenticated every right on new public tables by default (select,
-- insert, update, delete, truncate, ...), so the narrower grants in the DQ
-- migrations never narrowed anything; row-level security and triggers were
-- doing all the work. Take everything back and grant only what the app
-- uses, so the rights themselves enforce the rules too:
--
--   * Nothing is deleted or truncated by anyone signed in.
--   * Shared rules, the history log and reminders are read-only.
--   * Signed records, documents and applications can change only in the
--     columns their workflows use. Items keep a table-wide update (owners
--     and admins move dates, complete and close them), guarded by their
--     trigger and policies as before.
--
-- anon (signed out) gets nothing. The secret key used by the daily job is
-- unaffected.

revoke all on table
  public.dq_requirement_templates,
  public.dq_state_rules,
  public.dq_items,
  public.dq_documents,
  public.dq_attestations,
  public.dq_employment_applications,
  public.dq_employer_checks,
  public.dq_audit_log,
  public.dq_reminders
from anon, authenticated;

grant select on public.dq_requirement_templates to authenticated;
grant select on public.dq_state_rules to authenticated;
grant select on public.dq_audit_log to authenticated;
grant select on public.dq_reminders to authenticated;

grant select, insert, update on public.dq_items to authenticated;

grant select, insert on public.dq_documents to authenticated;
grant update (
  ai_extraction, ai_extracted_at, issue_date, expiry_date,
  confirmed_at, superseded_at, superseded_by
) on public.dq_documents to authenticated;

grant select, insert on public.dq_attestations to authenticated;
grant update (pdf_path, voided_at, void_reason) on public.dq_attestations to authenticated;

grant select, insert on public.dq_employment_applications to authenticated;
grant update (
  answers, ssn_ciphertext, ssn_last4, date_of_birth_ciphertext, attestation_id
) on public.dq_employment_applications to authenticated;

grant select, insert on public.dq_employer_checks to authenticated;
