# OfficeTruck — Driver Qualification (DQ) File spec

Nov 16, 2026 · Bhumir Patel

Converted from the PDF of the same name. The tables were rebuilt from the PDF's
text; check them against the original if anything looks off.

## What it is

A driver qualification (DQ) file is the set of records federal rule 49 CFR
391.51 makes a carrier keep on every driver it employs. A one-truck
owner-operator is their own driver and needs one too.

The feature does four things:

1. Holds a fixed checklist of required items per driver, each with a document
   or a signed record behind it.
2. Computes a status for every item and every driver: complete, due soon,
   overdue, missing.
3. Creates the recurring work on its own schedule (annual driving record,
   annual review, annual Clearinghouse query, medical renewal).
4. Exports one driver's complete file as a single PDF for an auditor.

This extends the existing compliance calendar, which only tracks expiry dates.
Status: an add-on idea at about $5 per driver per month. It is not part of the
first 5 pilots.

## Required items in the DQ file

The current text of 391.51(b) lists eight items. Seed these as the checklist
template.

| # | Item | Rule | Applies to | Due | Repeats | Keep for |
|---|------|------|------------|-----|---------|----------|
| 1 | Employment application, signed and dated | 391.21 | All drivers | Before first trip | No | Employment + 3 years |
| 2 | Driving record (MVR) from each state that licensed the driver in the past 3 years | 391.23(a)(1) | All drivers | Within 30 days of start date | No | Employment + 3 years |
| 3 | Road test certificate, or a copy of the CDL accepted in its place | 391.31, 391.33 | All drivers | Before first trip | No | Employment + 3 years |
| 4 | Annual MVR | 391.25(a) | All drivers | Every 12 months | Yes | 3 years from its date |
| 5 | Annual review note: reviewer name, date, signed statement that the MVR was reviewed | 391.25(c)(2) | All drivers | Every 12 months, with item 4 | Yes | 3 years from its date |
| 6a | Medical proof, CDL driver: MVR showing current medical certification status | 391.51(b)(6)(ii) | CDL and CLP holders | Before first trip, then after each new exam | Yes, at most every 24 months | 3 years from its date |
| 6b | Medical proof, non-CDL driver: copy of the medical examiner's certificate | 391.43(g) | Non-CDL drivers | Before first trip, then at each renewal | Yes, at most every 24 months | 3 years from its date |
| 7 | Medical variance, Skill Performance Evaluation certificate or exemption letter | 391.49, part 381 | Only drivers who hold one | With the medical proof | When renewed | 3 years from its date |
| 8 | Note that the medical examiner was verified on the National Registry | 391.23(m)(1) | Non-CDL drivers | At each medical exam | Yes | 3 years from its date |

Three rules the code must respect:

- **CDL medical proof changed.** Since June 23, 2025 the MVR is the proof for
  CDL drivers, and the registry-verification note is no longer required for
  them. A paper-card waiver was extended several times; one compliance firm
  reports it ended October 11, 2026 everywhere except Alaska. Make the
  paper-card grace period a per-state setting, default 0 days, and confirm the
  current status before launch.
- **Do not add an "annual list of violations" item.** Many online checklists
  still show it (391.27). It is not in the current 391.51(b).
- **Medical expiry is per driver.** Certificates run up to 24 months but
  examiners often issue 12 months or less. Store the actual expiry date; never
  assume 24.

Sources: eCFR 391.51, DISA on the medical certificate rule, WFQA on the waiver
ending.

## Two files that must stay separate

Auditors ask for these alongside the DQ file, but access is restricted. Model
them as separate file types with their own permissions, not as more checklist
rows.

| File | Rule | What goes in it | Who may see it | Keep for |
|------|------|-----------------|----------------|----------|
| Safety performance history (driver investigation history) | 391.53, 391.23(c) | Driver's written authorization; each previous employer's name and address, date contacted, and what they said; a record of every failed attempt | Only people involved in hiring or who control the data | Employment + 3 years |
| Drug and alcohol file | Part 382 | Pre-employment test result, Clearinghouse query records, driver consent forms | Owner or designated admin only | Varies by record; do not auto-delete in v1 |

Clearinghouse tasks (CDL drivers only), per FMCSA:

- **Pre-employment:** a full query before the driver's first trip. Needs the
  driver's consent given inside the Clearinghouse.
- **Annual:** a limited query within 12 months of the last query, tracked per
  driver on a rolling basis. Needs a signed general consent form kept outside
  the Clearinghouse, which can cover multiple years.
- **Escalation:** if a limited query shows a record exists, a full query is
  required within 24 hours or the driver comes off the road.

Previous-employer checks cover the past 3 years and are due within 30 days of
the start date. OfficeTruck records these checks and queries; it does not run
them. The carrier runs queries in the FMCSA portal and uploads the result.

## What the product does

**Driver setup.** Adding a driver asks for start date, license class (CDL or
non-CDL), license state, and any other states that licensed them in the past 3
years. From those answers the app builds that driver's checklist: 6a or 6b,
item 8 only for non-CDL, one hire MVR per state, Clearinghouse tasks only for
CDL.

**Item status.** Every checklist item has exactly one status, computed from
data and never typed in:

| Status | Meaning |
|--------|---------|
| Missing | Required now, nothing on file |
| Pending review | Uploaded, waiting for the owner to confirm |
| Complete | Confirmed and inside its valid period |
| Due soon | Complete, but expires or recurs within 30 days |
| Overdue | Past its due or expiry date |
| Not applicable | Does not apply to this driver, with a stored reason |

**Driver status.** A driver is Audit-ready when every applicable item is
Complete or Due soon. Otherwise the driver shows the count of Missing and
Overdue items. The fleet screen shows one row per driver with that status and
the next due date.

**Recurring work.** Completing an annual MVR creates the next one due 12 months
later, and opens the paired annual review note. Completing a Clearinghouse
query creates the next one due 12 months from the query date. A new medical
expiry date creates a renewal task. Tasks appear in the existing compliance
calendar.

**Reminders.** Push and email to the owner at 60, 30, 14 and 7 days before a
due date, then weekly once overdue. The driver gets a push for items only they
can supply (medical exam, signatures).

**Uploads.** The driver or owner photographs a document in the phone app, using
the same upload flow as BOL and POD. AI reads the document type, driver name,
issue date and expiry date, and proposes which checklist item it belongs to.
The owner confirms or corrects before anything counts as Complete.

**Built-in forms.** Three items are records the carrier creates, so the app
generates them: the employment application (driver fills and signs on the
phone), the annual review note (owner signs), and the registry-verification
note (owner signs). Each saves as a PDF with name, timestamp and signature.

**Audit export.** One tap produces a single PDF per driver: a cover sheet
listing each item, its rule number, date and status, followed by the documents
in checklist order. The two restricted files export separately and only for
the owner.

**Driver leaves.** Setting an end date stops all recurring tasks, freezes the
file, and starts the retention clock. The file stays read-only until the end
date plus 3 years.

## Data model

Every table carries `organization_id` with row-level security, except the
shared template table.

| Table | Purpose | Key fields |
|-------|---------|------------|
| `dq_requirement_templates` | The checklist rules, seeded from the table above. Global, read-only to tenants. | `code`, `title`, `cfr_ref`, `applies_to` (all, cdl, non_cdl, conditional), `file_type` (dq, investigation, drug_alcohol), `due_rule`, `recurrence_months`, `retention_rule`, `effective_from`, `effective_to` |
| `drivers` (existing, extend) | Driver facts that drive the checklist | `license_class`, `license_state`, `prior_license_states[]`, `start_date`, `end_date` |
| `dq_items` | One row per driver per requirement per cycle | `driver_id`, `template_code`, `due_date`, `completed_at`, `valid_until`, `not_applicable_reason`, `cycle_number` |
| `dq_documents` | Files and generated forms attached to an item | `dq_item_id`, `storage_path`, `source` (upload, generated), `issue_date`, `expiry_date`, `ai_extraction` (json), `confirmed_by`, `confirmed_at` |
| `dq_attestations` | Signed records: review notes, verification notes, applications | `dq_item_id`, `type`, `signer_id`, `signed_at`, `statement_text`, `pdf_path` |
| `dq_employer_checks` | Previous-employer contact log | `driver_id`, `employer_name`, `employer_address`, `contacted_at`, `method`, `outcome`, `response_document_id` |
| `dq_audit_log` | Append-only history of every change | `actor_id`, `action`, `entity`, `entity_id`, `before`, `after`, `at` |

Design rules:

- Status is derived from `due_date`, `completed_at`, `valid_until` and today's
  date. Do not store it as a column.
- Rules live in template rows with effective dates, not in code. The
  medical-proof rule already changed in 2025 and will change again.
- Recurring items are new `dq_items` rows with the next `cycle_number`. Old
  cycles stay as history; an auditor can ask for 3 years of annual MVRs.
- Documents are never hard-deleted by users. Replacing a document adds a new
  row and marks the old one superseded.

## Guardrails

- **Tenant isolation.** Every query is scoped to the organization. Storage paths
  start with the organization id, and files are served through short-lived
  signed URLs.
- **Sensitive data.** The employment application holds a Social Security number
  and date of birth. Encrypt those fields, show only the last 4 digits in the
  app, and keep them out of logs and AI prompts.
- **Roles.** Owner and admin see everything. A driver sees and uploads only
  their own DQ items. Nobody but owner and admin can open the investigation or
  drug and alcohol files, and those never appear in the standard audit export.
- **AI proposes, a person confirms.** AI extraction never marks an item
  Complete, never sets an expiry date on its own, and never signs or sends
  anything. Every attestation needs a named person tapping to sign.
- **Retention.** Nothing is auto-deleted in v1. When an item passes its
  retention date, flag it as eligible for removal and let the owner decide.
- **Wording.** Call the status "Audit-ready", not "compliant". The app
  organizes records; it does not certify that a carrier meets federal rules.
  Put that in the export footer.

## Not in v1

- Ordering MVRs through a provider API (the owner uploads the PDF; paid pulls
  come later as a pass-through add-on)
- Running Clearinghouse queries or connecting to the FMCSA portal
- Random drug test pools, test scheduling, or lab results beyond the
  pre-employment result
- Driver recruiting, applicant tracking, or background checks
- Hours-of-service records, vehicle maintenance files, accident register
- Emailing previous employers automatically (v1 logs the contact; the owner
  makes it)
- State-specific intrastate rules; v1 covers interstate carriers only

## Sources

- eCFR 49 CFR 391.51, driver qualification files (required items and retention)
- eCFR 49 CFR 391.53, driver investigation history file (contents, access,
  retention)
- FMCSA Clearinghouse: query requirements (annual limited query, consent,
  rolling 12 months)
- DISA: paper medical certificates eliminated for CDL drivers (search summary,
  not opened in full)
- WFQA: paper-certificate waiver expiry (search summary, not opened in full;
  confirm before launch)

Not verified against the rule text in this pass: the exact wording of 391.21
(application contents), 391.23 (30-day deadlines and 3-year lookback) and
391.25 (annual review). These are long-standing requirements, but have Claude
Code or a compliance contact check them before the checklist ships. This is a
product spec, not legal advice.

## Decisions made while building

Answers to questions the spec left open, from the build conversation:

- **Drivers sign in with their phone number** (SMS code). They are not added
  to `organization_users`, so they can't see the office's loads, invoices or
  other drivers. Each driver row links to at most one login through
  `drivers.user_id`.
- Restricted files (investigation, drug and alcohol): owner and admin (the
  prompt and the spec's guardrails; the export section said owner only).
- Members (office staff) can read the standard DQ checklist and its documents,
  but can't upload, confirm, sign, or open the restricted files.
- SSN and date of birth are encrypted in the app server (AES-256-GCM) before
  they reach the database, which stores only ciphertext and the SSN's last 4.
- A seventh status, **Upcoming**: nothing on file and not due for more than
  30 days (the first annual MVR at hire, a renewal a year out). It counts
  toward Audit-ready. Within 30 days of its due date an open item is Due soon;
  on the due date with nothing on file it's Missing; after it, Overdue.
- An upload waiting for review shows as Pending review even when it's late,
  since confirming it is what's needed. It keeps the driver from being
  Audit-ready.
- Status is judged on the latest cycle of each item; earlier cycles are
  history.
- Items that would fall due after a driver's end date aren't created.
- The first annual limited Clearinghouse query is due 12 months after the
  start date, not 12 months after the pre-employment full query.
- **Every driver is set up as a CDL holder** (decided Nov 17, 2026). Setup no
  longer asks for the license class, so every driver gets the CDL checklist:
  the MVR as medical proof and the drug and alcohol file. The non-CDL rules
  (6b medical certificate and the registry-verification note) stay in the
  templates and the rules engine, unused, in case non-CDL drivers (hotshot,
  box trucks) are supported later. A driver with no class saved counts as
  CDL.
- **The non-CDL medical rules are ended** (Nov 17, 2026): the examiner's
  certificate and the National Registry note have `effective_to` set, so
  no driver gets them. Items of an ended rule that were marked not
  applicable are left off the checklist and export, and kept in history.
