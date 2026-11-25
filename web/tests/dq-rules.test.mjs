import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  addMonths,
  buildChecklist,
  currentItems,
  driverStatus,
  itemStatus,
  nextCycle,
  retentionUntil,
  rulesOn,
  validUntil,
} from "../lib/dq-rules.ts"

// The rules as seeded by the dq_requirement_templates migrations.
const rule = (code, fields) => ({
  id: `t-${code}`,
  code,
  title: code,
  cfr_ref: "391",
  file_type: "dq",
  applies_to: "all",
  due_rule: "before_first_trip",
  due_offset_days: null,
  due_offset_hours: null,
  recurrence_months: null,
  max_validity_months: null,
  per_state: false,
  paired_code: null,
  follows_paired: false,
  applies_when: null,
  trigger_code: null,
  trigger_result: null,
  evidence: "document",
  retention_rule: "employment_plus_years",
  retention_years: 3,
  sort_order: 0,
  effective_from: "-infinity",
  effective_to: "infinity",
  ...fields,
})

const TEMPLATES = [
  rule("employment_application", { evidence: "attestation", sort_order: 10 }),
  rule("hire_mvr", {
    due_rule: "days_after_start",
    due_offset_days: 30,
    per_state: true,
    sort_order: 20,
  }),
  rule("road_test", { sort_order: 30 }),
  rule("annual_mvr", {
    due_rule: "months_after_start",
    recurrence_months: 12,
    retention_rule: "from_item_years",
    sort_order: 40,
  }),
  rule("annual_review", {
    due_rule: "with_paired",
    paired_code: "annual_mvr",
    follows_paired: true,
    recurrence_months: 12,
    evidence: "attestation",
    retention_rule: "from_item_years",
    sort_order: 50,
  }),
  rule("medical_proof_cdl", {
    applies_to: "cdl",
    max_validity_months: 24,
    retention_rule: "from_item_years",
    sort_order: 60,
    effective_from: "2025-06-23",
  }),
  rule("medical_certificate", {
    applies_to: "non_cdl",
    max_validity_months: 24,
    retention_rule: "from_item_years",
    sort_order: 61,
    effective_from: "2025-06-23",
  }),
  rule("medical_variance", {
    applies_to: "conditional",
    applies_when: "holds_medical_variance",
    retention_rule: "from_item_years",
    sort_order: 70,
  }),
  rule("registry_verification", {
    applies_to: "non_cdl",
    due_rule: "with_paired",
    paired_code: "medical_certificate",
    follows_paired: true,
    evidence: "attestation",
    retention_rule: "from_item_years",
    sort_order: 80,
    effective_from: "2025-06-23",
  }),
  rule("investigation_authorization", {
    file_type: "investigation",
    due_rule: "days_after_start",
    due_offset_days: 30,
    sort_order: 110,
  }),
  rule("previous_employer_checks", {
    file_type: "investigation",
    due_rule: "days_after_start",
    due_offset_days: 30,
    evidence: "contact_log",
    sort_order: 120,
  }),
  rule("pre_employment_drug_test", {
    file_type: "drug_alcohol",
    applies_to: "cdl",
    retention_rule: "no_auto_delete",
    retention_years: null,
    sort_order: 210,
  }),
  rule("clearinghouse_full_query", {
    file_type: "drug_alcohol",
    applies_to: "cdl",
    retention_rule: "no_auto_delete",
    retention_years: null,
    sort_order: 220,
  }),
  rule("clearinghouse_consent", {
    file_type: "drug_alcohol",
    applies_to: "cdl",
    due_rule: "with_paired",
    paired_code: "clearinghouse_limited_query",
    retention_rule: "no_auto_delete",
    retention_years: null,
    sort_order: 230,
  }),
  rule("clearinghouse_limited_query", {
    file_type: "drug_alcohol",
    applies_to: "cdl",
    due_rule: "months_after_start",
    recurrence_months: 12,
    retention_rule: "no_auto_delete",
    retention_years: null,
    sort_order: 240,
  }),
  rule("clearinghouse_escalation_query", {
    file_type: "drug_alcohol",
    applies_to: "conditional",
    due_rule: "hours_after_trigger",
    due_offset_hours: 24,
    trigger_code: "clearinghouse_limited_query",
    trigger_result: "record_found",
    retention_rule: "no_auto_delete",
    retention_years: null,
    sort_order: 250,
  }),
]

const TODAY = "2026-11-16"

const driver = (fields) => ({
  license_class: "cdl",
  license_state: "TX",
  prior_license_states: [],
  start_date: "2026-11-16",
  end_date: null,
  holds_medical_variance: false,
  ...fields,
})

const codes = (items) => items.map((item) => item.template_code)
const find = (items, code) => items.find((item) => item.template_code === code)

/** A dq_items row from a planned item. */
const row = (planned, fields = {}) => ({
  ...planned,
  completed_at: null,
  valid_until: null,
  not_applicable_reason: null,
  pending_review: false,
  ...fields,
})

describe("buildChecklist: CDL vs non-CDL", () => {
  it("gives a CDL driver the MVR medical proof and the drug and alcohol file", () => {
    const items = buildChecklist(driver(), TEMPLATES, TODAY)
    assert.deepEqual(codes(items), [
      "employment_application",
      "hire_mvr",
      "road_test",
      "annual_mvr",
      "annual_review",
      "medical_proof_cdl",
      "investigation_authorization",
      "previous_employer_checks",
      "pre_employment_drug_test",
      "clearinghouse_full_query",
      "clearinghouse_consent",
      "clearinghouse_limited_query",
    ])
  })

  it("treats a CLP holder as CDL", () => {
    const items = buildChecklist(
      driver({ license_class: "clp" }),
      TEMPLATES,
      TODAY
    )
    assert.ok(find(items, "medical_proof_cdl"))
    assert.ok(!find(items, "medical_certificate"))
  })

  it("gives a non-CDL driver the certificate and registry note, and no Clearinghouse", () => {
    const items = buildChecklist(
      driver({ license_class: "non_cdl" }),
      TEMPLATES,
      TODAY
    )
    assert.ok(find(items, "medical_certificate"))
    assert.ok(find(items, "registry_verification"))
    assert.ok(!find(items, "medical_proof_cdl"))
    assert.ok(!items.some((item) => item.file_type === "drug_alcohol"))
  })

  it("adds the variance only for a driver who holds one", () => {
    assert.ok(
      !find(buildChecklist(driver(), TEMPLATES, TODAY), "medical_variance")
    )
    assert.ok(
      find(
        buildChecklist(
          driver({ holds_medical_variance: true }),
          TEMPLATES,
          TODAY
        ),
        "medical_variance"
      )
    )
  })

  it("never adds the escalation query up front", () => {
    assert.ok(
      !find(
        buildChecklist(driver(), TEMPLATES, TODAY),
        "clearinghouse_escalation_query"
      )
    )
  })

  it("treats a driver with no class saved as CDL", () => {
    const items = buildChecklist(
      driver({ license_class: null }),
      TEMPLATES,
      TODAY
    )
    assert.ok(find(items, "medical_proof_cdl"))
    assert.ok(!find(items, "medical_certificate"))
    assert.ok(find(items, "clearinghouse_full_query"))
  })

  it("uses the rules in force on the day", () => {
    // Before June 23, 2025, neither medical rule as seeded applied.
    const items = buildChecklist(driver(), TEMPLATES, "2025-06-22")
    assert.ok(!find(items, "medical_proof_cdl"))
    assert.equal(
      rulesOn(TEMPLATES, "2025-06-23").filter((r) =>
        r.code.startsWith("medical_")
      ).length,
      3
    )
  })
})

describe("buildChecklist: hire MVRs per state", () => {
  it("makes one hire MVR per state licensed in the past 3 years", () => {
    const items = buildChecklist(
      driver({ license_state: "TX", prior_license_states: ["OK", "NM", "TX"] }),
      TEMPLATES,
      TODAY
    )
    const mvrs = items.filter((item) => item.template_code === "hire_mvr")
    assert.deepEqual(
      mvrs.map((item) => item.license_state),
      ["TX", "OK", "NM"]
    )
    assert.ok(mvrs.every((item) => item.due_date === "2026-12-16"))
  })

  it("still asks for one when no state is known", () => {
    const items = buildChecklist(
      driver({ license_state: null }),
      TEMPLATES,
      TODAY
    )
    const mvrs = items.filter((item) => item.template_code === "hire_mvr")
    assert.equal(mvrs.length, 1)
    assert.equal(mvrs[0].license_state, null)
  })

  it("keeps states apart when picking the current cycle", () => {
    const items = buildChecklist(
      driver({ prior_license_states: ["OK"] }),
      TEMPLATES,
      TODAY
    ).map((item) => row(item))
    assert.equal(
      currentItems(items).filter((item) => item.template_code === "hire_mvr")
        .length,
      2
    )
  })
})

describe("the 30-day hire deadlines", () => {
  const items = buildChecklist(
    driver({ start_date: "2026-11-01" }),
    TEMPLATES,
    "2026-11-01"
  )

  it("sets the hire MVR, authorization and employer checks 30 days after the start", () => {
    for (const code of [
      "hire_mvr",
      "investigation_authorization",
      "previous_employer_checks",
    ]) {
      assert.equal(find(items, code).due_date, "2026-12-01", code)
    }
  })

  it("is due soon inside the 30 days, then overdue", () => {
    const mvr = row(find(items, "hire_mvr"))
    assert.equal(itemStatus(mvr, "2026-11-02"), "due_soon")
    assert.equal(itemStatus(mvr, "2026-11-30"), "due_soon")
    assert.equal(itemStatus(mvr, "2026-12-01"), "missing")
    assert.equal(itemStatus(mvr, "2026-12-02"), "overdue")
  })

  it("puts before-first-trip items on the start date", () => {
    assert.equal(find(items, "employment_application").due_date, "2026-11-01")
    assert.equal(
      itemStatus(row(find(items, "road_test")), "2026-11-02"),
      "overdue"
    )
  })

  it("shows an upload awaiting review, even when late", () => {
    assert.equal(
      itemStatus(
        row(find(items, "hire_mvr"), { pending_review: true }),
        "2026-12-05"
      ),
      "pending_review"
    )
  })

  it("is missing with no start date", () => {
    const undated = buildChecklist(
      driver({ start_date: null }),
      TEMPLATES,
      TODAY
    )
    assert.equal(itemStatus(row(find(undated, "hire_mvr")), TODAY), "missing")
  })
})

describe("12-month recurrences", () => {
  const d = driver({ start_date: "2025-03-10" })
  const items = buildChecklist(d, TEMPLATES, "2025-03-10")

  it("first asks for the annual MVR and review 12 months after the start", () => {
    assert.equal(find(items, "annual_mvr").due_date, "2026-03-10")
    assert.equal(find(items, "annual_review").due_date, "2026-03-10")
    assert.equal(
      itemStatus(row(find(items, "annual_mvr")), "2025-06-01"),
      "upcoming"
    )
  })

  it("makes the next annual MVR and review 12 months from the MVR's date", () => {
    const mvr = find(items, "annual_mvr")
    const next = nextCycle(
      row(mvr, {
        completed_at: "2026-03-02T15:00:00Z",
        done_on: "2026-02-27",
        valid_until: validUntil(TEMPLATES[3], "2026-02-27", null),
      }),
      TEMPLATES,
      d
    )
    assert.deepEqual(
      next.map((item) => [
        item.template_code,
        item.cycle_number,
        item.due_date,
      ]),
      [
        ["annual_mvr", 2, "2027-02-27"],
        ["annual_review", 2, "2027-02-27"],
      ]
    )
  })

  it("doesn't make another review when the review itself is signed", () => {
    const review = find(items, "annual_review")
    assert.deepEqual(
      nextCycle(
        row(review, { completed_at: "2026-03-02T15:00:00Z", done_on: null }),
        TEMPLATES,
        d
      ),
      []
    )
  })

  it("runs a limited query 12 months from the last query date", () => {
    const query = find(items, "clearinghouse_limited_query")
    const next = nextCycle(
      row(query, {
        completed_at: "2026-02-20T10:00:00Z",
        done_on: "2026-02-20",
        query_result: "no_record",
      }),
      TEMPLATES,
      d
    )
    assert.deepEqual(
      next.map((item) => [item.template_code, item.due_date]),
      [["clearinghouse_limited_query", "2027-02-20"]]
    )
  })

  it("judges the latest cycle, not the expired one before it", () => {
    const first = row(find(items, "annual_mvr"), {
      completed_at: "2026-03-01T00:00:00Z",
      valid_until: "2027-03-01",
    })
    const second = row({
      ...find(items, "annual_mvr"),
      cycle_number: 2,
      due_date: "2027-03-01",
    })
    // Two years on, the first is long expired; the second is what's due.
    assert.equal(itemStatus(first, "2027-04-01"), "overdue")
    assert.deepEqual(currentItems([first, second]), [second])
    assert.equal(itemStatus(second, "2027-02-10"), "due_soon")
  })

  it("still counts an earlier cycle that was never done", () => {
    // Completing year 1's annual MVR adds year 2's review, while year 1's
    // review may not be signed yet: it mustn't drop out of the file.
    const first = row({
      ...find(items, "annual_review"),
      due_date: "2027-01-01",
    })
    const second = row({
      ...find(items, "annual_review"),
      cycle_number: 2,
      due_date: "2027-11-24",
    })
    assert.deepEqual(currentItems([first, second]), [first, second])
    assert.equal(
      driverStatus([first, second], "2027-01-10").status,
      "not_audit_ready"
    )
    // Once it's marked not applicable, it's history again.
    const waived = { ...first, not_applicable_reason: "Not needed." }
    assert.deepEqual(currentItems([waived, second]), [second])
  })

  it("keeps to the end of the month from Feb 29", () => {
    assert.equal(addMonths("2028-02-29", 12), "2029-02-28")
    assert.equal(addMonths("2026-01-31", 1), "2026-02-28")
  })
})

describe("medical expiry shorter than 24 months", () => {
  const nonCdl = driver({ license_class: "non_cdl", start_date: "2026-01-05" })
  const certificate = TEMPLATES.find((t) => t.code === "medical_certificate")

  it("uses the printed expiry date, never 24 months", () => {
    assert.equal(
      validUntil(certificate, "2026-01-05", "2027-01-05"),
      "2027-01-05"
    )
    assert.equal(
      validUntil(certificate, "2026-01-05", "2026-04-05"),
      "2026-04-05"
    )
  })

  it("never runs longer than 24 months", () => {
    assert.equal(
      validUntil(certificate, "2026-01-05", "2029-01-05"),
      "2028-01-05"
    )
  })

  it("can't be completed without an expiry date", () => {
    assert.throws(
      () => validUntil(certificate, "2026-01-05", null),
      /expiry date/
    )
  })

  it("asks for the renewal and a new registry note when the 12-month card runs out", () => {
    const item = find(
      buildChecklist(nonCdl, TEMPLATES, "2026-01-05"),
      "medical_certificate"
    )
    const completed = row(item, {
      completed_at: "2026-01-05T12:00:00Z",
      done_on: "2026-01-05",
      valid_until: validUntil(certificate, "2026-01-05", "2027-01-05"),
    })
    assert.deepEqual(
      nextCycle(completed, TEMPLATES, nonCdl).map((n) => [
        n.template_code,
        n.cycle_number,
        n.due_date,
      ]),
      [
        ["medical_certificate", 2, "2027-01-05"],
        ["registry_verification", 2, "2027-01-05"],
      ]
    )
    assert.equal(itemStatus(completed, "2026-12-10"), "due_soon")
    assert.equal(itemStatus(completed, "2027-01-06"), "overdue")
  })
})

describe("a driver with an end date", () => {
  const leaving = driver({ start_date: "2026-01-05", end_date: "2026-11-30" })

  it("leaves out items that would fall due after they leave", () => {
    const items = buildChecklist(leaving, TEMPLATES, "2026-01-05")
    assert.ok(!find(items, "annual_mvr"))
    assert.ok(!find(items, "clearinghouse_limited_query"))
    assert.ok(find(items, "road_test"))
  })

  it("stops recurring work at the end date", () => {
    const certificate = TEMPLATES.find((t) => t.code === "medical_proof_cdl")
    const item = row(
      find(
        buildChecklist(leaving, TEMPLATES, "2026-01-05"),
        "medical_proof_cdl"
      ),
      {
        completed_at: "2026-01-05T12:00:00Z",
        done_on: "2026-01-05",
        valid_until: validUntil(certificate, "2026-01-05", "2027-01-05"),
      }
    )
    assert.deepEqual(nextCycle(item, TEMPLATES, leaving), [])
  })

  it("keeps employment-based records 3 years past the end date", () => {
    const application = TEMPLATES[0]
    assert.equal(
      retentionUntil(application, "2026-01-05", leaving),
      "2029-11-30"
    )
    assert.equal(retentionUntil(application, "2026-01-05", driver()), null)
    const annual = TEMPLATES.find((t) => t.code === "annual_mvr")
    assert.equal(retentionUntil(annual, "2026-02-27", leaving), "2029-02-27")
    const drugTest = TEMPLATES.find(
      (t) => t.code === "pre_employment_drug_test"
    )
    assert.equal(retentionUntil(drugTest, "2026-01-05", leaving), null)
  })
})

describe("Clearinghouse limited-to-full escalation", () => {
  const d = driver({ start_date: "2025-03-10" })
  const query = find(
    buildChecklist(d, TEMPLATES, "2025-03-10"),
    "clearinghouse_limited_query"
  )
  const found = row(query, {
    completed_at: "2026-03-02T21:30:00Z",
    done_on: "2026-03-02",
    query_result: "record_found",
  })

  it("asks for a full query within 24 hours when a record is found", () => {
    const next = nextCycle(found, TEMPLATES, d)
    const escalation = find(next, "clearinghouse_escalation_query")
    assert.ok(escalation)
    assert.equal(escalation.due_date, "2026-03-03")
    assert.equal(escalation.file_type, "drug_alcohol")
    // The yearly limited query keeps going too.
    assert.equal(
      find(next, "clearinghouse_limited_query").due_date,
      "2027-03-02"
    )
  })

  it("is overdue the day after", () => {
    const escalation = row(
      find(nextCycle(found, TEMPLATES, d), "clearinghouse_escalation_query")
    )
    assert.equal(itemStatus(escalation, "2026-03-03"), "missing")
    assert.equal(itemStatus(escalation, "2026-03-04"), "overdue")
  })

  it("asks for nothing extra when no record is found", () => {
    const next = nextCycle(
      { ...found, query_result: "no_record" },
      TEMPLATES,
      d
    )
    assert.ok(!find(next, "clearinghouse_escalation_query"))
  })
})

describe("driverStatus", () => {
  it("is never Audit-ready without a checklist", () => {
    assert.deepEqual(driverStatus([], TODAY), { status: "no_checklist" })
  })

  const d = driver({ license_class: "non_cdl", start_date: "2026-01-05" })
  const dq = buildChecklist(d, TEMPLATES, "2026-01-05").filter(
    (item) => item.file_type === "dq"
  )
  const done = (item) =>
    row(item, {
      completed_at: "2026-01-05T12:00:00Z",
      valid_until:
        item.template_code === "medical_certificate" ? "2026-12-01" : null,
    })

  it("is Audit-ready when everything is complete, due soon or upcoming", () => {
    const items = dq.map((item) =>
      item.template_code.startsWith("annual") ? row(item) : done(item)
    )
    assert.deepEqual(driverStatus(items, "2026-11-16"), {
      status: "audit_ready",
      nextDueDate: "2026-12-01",
    })
  })

  it("otherwise counts what's missing, overdue and waiting for review", () => {
    const items = dq.map((item) => {
      if (item.template_code === "road_test") return row(item)
      if (item.template_code === "hire_mvr")
        return row(item, { pending_review: true })
      if (item.template_code === "employment_application")
        return row(item, {
          not_applicable_reason: "Rehired; application on file from 2024.",
        })
      return done(item)
    })
    assert.deepEqual(driverStatus(items, "2026-02-10"), {
      status: "not_audit_ready",
      missing: 0,
      overdue: 1,
      pendingReview: 1,
      nextDueDate: "2026-01-05",
    })
  })

  it("counts an item with no due date as missing", () => {
    const undated = buildChecklist(
      driver({ start_date: null }),
      TEMPLATES,
      TODAY
    ).filter((item) => item.file_type === "dq")
    const status = driverStatus(
      undated.map((item) => row(item)),
      TODAY
    )
    assert.equal(status.status, "not_audit_ready")
    assert.equal(status.missing, undated.length)
  })
})
