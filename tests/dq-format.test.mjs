import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  annualReviewStatement,
  applicationStatement,
  DQ_STATUS_LABELS,
  EXPORT_DISCLAIMER,
  registryStatement,
  reminderDate,
  reminderFor,
} from "../lib/dq-format.ts"

const DUE = "2026-12-31"

describe("reminderFor: 60, 30, 14 and 7 days ahead", () => {
  it("sends nothing more than 60 days out", () => {
    assert.equal(reminderFor(DUE, "2026-10-31"), null)
  })

  it("sends each one on its day", () => {
    assert.deepEqual(reminderFor(DUE, "2026-11-01"), {
      key: "d60",
      date: "2026-11-01",
    })
    assert.deepEqual(reminderFor(DUE, "2026-12-01"), {
      key: "d30",
      date: "2026-12-01",
    })
    assert.deepEqual(reminderFor(DUE, "2026-12-17"), {
      key: "d14",
      date: "2026-12-17",
    })
    assert.deepEqual(reminderFor(DUE, "2026-12-24"), {
      key: "d7",
      date: "2026-12-24",
    })
  })

  it("catches up a missed one, keeping its key so it goes once", () => {
    // 46 days out: the 60-day reminder is still the latest one due.
    assert.deepEqual(reminderFor(DUE, "2026-11-15"), {
      key: "d60",
      date: "2026-11-01",
    })
    // 20 days out: the 30-day one.
    assert.equal(reminderFor(DUE, "2026-12-11").key, "d30")
  })

  it("adds nothing new on the due date itself", () => {
    assert.equal(reminderFor(DUE, DUE).key, "d7")
  })
})

describe("reminderFor: weekly once overdue", () => {
  it("starts the day after", () => {
    assert.deepEqual(reminderFor(DUE, "2027-01-01"), {
      key: "overdue_0",
      date: "2027-01-01",
    })
    assert.equal(reminderFor(DUE, "2027-01-07").key, "overdue_0")
  })

  it("then every 7 days", () => {
    assert.deepEqual(reminderFor(DUE, "2027-01-08"), {
      key: "overdue_1",
      date: "2027-01-08",
    })
    assert.deepEqual(reminderFor(DUE, "2027-01-15"), {
      key: "overdue_2",
      date: "2027-01-15",
    })
    assert.equal(reminderFor(DUE, "2027-01-21").key, "overdue_2")
  })
})

describe("reminderDate", () => {
  const item = {
    completed_at: null,
    valid_until: null,
    due_date: "2026-12-01",
    not_applicable_reason: null,
  }

  it("uses the due date for open items and the expiry for completed ones", () => {
    assert.equal(reminderDate(item), "2026-12-01")
    assert.equal(
      reminderDate({
        ...item,
        completed_at: "2026-01-01T00:00:00Z",
        valid_until: "2027-01-01",
      }),
      "2027-01-01"
    )
  })

  it("never reminds about items that don't run out or don't apply", () => {
    assert.equal(
      reminderDate({ ...item, completed_at: "2026-01-01T00:00:00Z" }),
      null
    )
    assert.equal(
      reminderDate({ ...item, not_applicable_reason: "Rehired" }),
      null
    )
  })
})

describe("wording", () => {
  it("says Audit-ready, never compliant", () => {
    const labels = Object.values(DQ_STATUS_LABELS).join(" ")
    assert.ok(!/compliant/i.test(labels))
    assert.ok(!/compliant/i.test(EXPORT_DISCLAIMER))
    assert.match(EXPORT_DISCLAIMER, /does not certify/)
    assert.ok(labels.includes("Upcoming"))
  })

  it("builds the signed statements from the facts", () => {
    assert.match(
      applicationStatement(),
      /true and complete to the best of my knowledge/
    )
    const review = annualReviewStatement({
      driverName: "Ana Torres",
      mvrDate: "2026-02-27",
    })
    assert.match(review, /Ana Torres/)
    assert.match(review, /2026-02-27/)
    assert.match(review, /391\.25/)
    const registry = registryStatement({
      driverName: "Ana Torres",
      examinerName: "Dr. Lee",
      registryNumber: "1234567890",
      verifiedOn: "2026-01-05",
    })
    assert.match(registry, /Dr\. Lee, registry number 1234567890/)
    assert.match(registry, /National Registry/)
  })
})
