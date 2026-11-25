import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  assignmentDates,
  assignmentProblems,
  loadUntil,
  problemSentence,
  problemShort,
} from "../lib/assignment-compliance.ts"
import { complianceItems } from "../lib/driver-format.ts"
import { truckComplianceItems } from "../lib/truck-format.ts"

const TODAY = "2026-11-25"

describe("assignmentDates", () => {
  it("keeps the dates that are set, flagging the past ones", () => {
    const dates = assignmentDates(
      complianceItems(
        { cdl_expires_on: "2028-01-10", medical_card_expires_on: "2026-11-03" },
        undefined,
        TODAY
      )
    )
    assert.deepEqual(dates, [
      { label: "CDL", kind: "expires", due: "2028-01-10", expired: false },
      {
        label: "Medical card",
        kind: "expires",
        due: "2026-11-03",
        expired: true,
      },
    ])
  })

  it("reads a truck's inspection as due a year after it was done", () => {
    const dates = assignmentDates(
      truckComplianceItems(
        {
          annual_inspection_on: "2025-11-20",
          registration_expires_on: null,
          plate_expires_on: null,
        },
        TODAY
      )
    )
    assert.deepEqual(dates, [
      {
        label: "Annual inspection",
        kind: "due",
        due: "2026-11-20",
        expired: true,
      },
    ])
  })
})

describe("assignmentProblems", () => {
  const dates = [
    { label: "CDL", kind: "expires", due: "2028-01-10", expired: false },
    {
      label: "Registration",
      kind: "expires",
      due: "2026-11-30",
      expired: false,
    },
    {
      label: "Medical card",
      kind: "expires",
      due: "2026-11-03",
      expired: true,
    },
  ]

  it("lists what's past and what runs out before the load's last day", () => {
    assert.deepEqual(
      assignmentProblems(dates, "2026-12-01").map((d) => d.label),
      ["Medical card", "Registration"]
    )
  })

  it("counts a date as good through its own day", () => {
    assert.deepEqual(
      assignmentProblems(dates, "2026-11-30").map((d) => d.label),
      ["Medical card"]
    )
  })

  it("only lists what's past without a load date", () => {
    assert.deepEqual(
      assignmentProblems(dates, null).map((d) => d.label),
      ["Medical card"]
    )
  })
})

describe("problem wording", () => {
  const expired = {
    label: "Medical card",
    kind: "expires",
    due: "2026-11-03",
    expired: true,
  }
  const overdue = {
    label: "Annual inspection",
    kind: "due",
    due: "2026-11-20",
    expired: true,
  }
  const soon = {
    label: "CDL",
    kind: "expires",
    due: "2026-11-30",
    expired: false,
  }

  it("says it short for the pickers", () => {
    assert.equal(problemShort(expired), "Medical card expired Nov 3, 2026")
    assert.equal(
      problemShort(overdue),
      "Annual inspection overdue since Nov 20, 2026"
    )
    assert.equal(
      problemShort(soon),
      "CDL expires Nov 30, 2026, before delivery"
    )
  })

  it("names whose it is in the warning", () => {
    assert.equal(
      problemSentence("Beth Calloway", expired),
      "Beth Calloway's medical card expired Nov 3, 2026."
    )
    assert.equal(
      problemSentence("Truck T-102", overdue),
      "Truck T-102's annual inspection was due Nov 20, 2026."
    )
    assert.equal(
      problemSentence("Adam Herron", soon),
      "Adam Herron's CDL expires Nov 30, 2026, before this load delivers."
    )
  })
})

describe("loadUntil", () => {
  it("takes the end of the delivery window, else its start", () => {
    assert.equal(
      loadUntil({
        delivery_start: "2026-12-01T08:00:00",
        delivery_end: "2026-12-02T17:00:00",
      }),
      "2026-12-02"
    )
    assert.equal(
      loadUntil({ delivery_start: "2026-12-01T08:00:00", delivery_end: null }),
      "2026-12-01"
    )
  })
})
