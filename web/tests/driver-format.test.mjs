import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  complianceItems,
  dqComplianceDates,
  driverEarnings,
  driverNextStep,
  driverNextSteps,
  weekStart,
} from "../lib/driver-format.ts"

const TODAY = "2026-11-15" // a Sunday

const load = (overrides) => ({
  id: overrides.reference ?? "L1",
  reference: "L1",
  status: "delivered",
  rate: 1000,
  miles: 400,
  driver_pay_type: "per_mile",
  driver_pay_rate: 0.5,
  pickup_location: "Dallas, TX",
  delivery_location: "Tulsa, OK",
  pickup_start: "2026-11-10T08:00:00",
  delivery_start: "2026-11-11T08:00:00",
  ...overrides,
})

// The CDL from the driver; the rest from their qualification file.
const done = (due, last = null) => ({ due, last, done: true })
const current = {
  cdl_expires_on: "2028-01-01",
  dq: {
    medical: done("2028-01-01"),
    annualReview: done("2027-06-01", "2026-06-01"),
    clearinghouse: done("2027-06-01", "2026-06-01"),
  },
}
const withMedical = (date) => ({
  ...current,
  dq: { ...current.dq, medical: date },
})
// A driver whose profile is complete, so only dates and loads lead.
const active = {
  full_name: "Ana Torres",
  status: "active",
  phone: "4055550118",
  start_date: "2026-01-05",
  cdl_number: "R482931055",
  cdl_state: "OK",
  cdl_class: "A",
  documents: ["cdl", "medical_card"],
}

describe("weekStart", () => {
  it("starts the week on Monday", () => {
    assert.equal(weekStart("2026-11-15"), "2026-11-09") // Sunday
    assert.equal(weekStart("2026-11-09"), "2026-11-09") // Monday
    assert.equal(weekStart("2026-11-01"), "2026-10-26") // across months
  })
})

describe("driverEarnings", () => {
  it("counts earned loads by delivery date at the locked rate", () => {
    const earnings = driverEarnings(
      [
        load({ reference: "week", delivery_start: "2026-11-12T09:00:00" }),
        load({ reference: "month", delivery_start: "2026-11-02T09:00:00" }),
        load({ reference: "year", delivery_start: "2026-03-02T09:00:00" }),
        load({ reference: "old", delivery_start: "2025-12-30T09:00:00" }),
      ],
      TODAY
    )
    assert.equal(earnings.week.loads, 1)
    assert.equal(earnings.week.pay, 200)
    assert.equal(earnings.month.loads, 2)
    assert.equal(earnings.year.loads, 3)
    assert.equal(earnings.all.loads, 4)
    assert.equal(earnings.all.pay, 800)
    assert.equal(earnings.all.miles, 1600)
  })

  it("keeps booked loads apart and leaves out ones never driven", () => {
    const earnings = driverEarnings(
      [
        load({ reference: "a", status: "booked" }),
        load({ reference: "b", status: "loaded" }),
        load({ reference: "c", status: "cancelled" }),
        load({ reference: "d", status: "tonu" }),
      ],
      TODAY
    )
    assert.equal(earnings.all.loads, 0)
    assert.equal(earnings.ahead.loads, 2)
    assert.equal(earnings.ahead.pay, 400)
  })

  it("flags per-mile loads without miles instead of counting them as $0", () => {
    const earnings = driverEarnings([load({ miles: null })], TODAY)
    assert.equal(earnings.all.pay, 0)
    assert.equal(earnings.all.unpriced, 1)
  })
})

describe("driverNextSteps", () => {
  const steps = (driver, dates = current, loads = []) =>
    driverNextSteps(driver, complianceItems(dates, dates.dq, TODAY), loads)

  it("lists what's missing from the profile, and where to fix it", () => {
    const list = steps({ full_name: "Ana Torres", status: "active" })
    assert.deepEqual(
      list.map((s) => [s.title, s.action?.target ?? s.action?.type]),
      [
        ["Add a phone number", "details"],
        ["Add the start date", "details"],
        ["Add the CDL number and state", "cdl"],
        ["Add the CDL class", "cdl"],
        ["Upload a copy of the CDL", "cdl"],
        ["Upload the medical card", "medical"],
        ["Ready for a load", "new_load"],
      ]
    )
  })

  it("puts late items first, then the load, then what runs out soon", () => {
    const list = steps(
      active,
      { ...withMedical(done("2026-11-01")), cdl_expires_on: "2026-11-24" },
      [load({ reference: "NOW", status: "dispatched" })]
    )
    assert.deepEqual(
      list.map((s) => s.title),
      ["Medical card expired", "On load NOW", "CDL expires in 9 days"]
    )
  })

  it("moves on once something's done", () => {
    const before = steps({ ...active, cdl_class: null })
    const after = steps(active)
    assert.equal(before[0].title, "Add the CDL class")
    assert.equal(after[0].title, "Ready for a load")
  })

  it("keeps a booked load at the end of the queue", () => {
    const list = steps({ ...active, phone: null }, current, [
      load({
        reference: "LATER",
        status: "booked",
        pickup_start: "2026-11-20T08:00:00",
      }),
    ])
    assert.deepEqual(
      list.map((s) => s.title),
      ["Add a phone number", "Next up: load LATER"]
    )
  })
})

describe("driverNextStep", () => {
  const step = (dates, loads = [], driver = active) =>
    driverNextStep(driver, complianceItems(dates, dates.dq, TODAY), loads)

  it("asks to bring an inactive driver back, whatever else is due", () => {
    const result = step({ ...current, cdl_expires_on: "2026-01-01" }, [], {
      ...active,
      status: "inactive",
    })
    assert.equal(result.action?.type, "activate")
  })

  it("puts a lapsed document ahead of the load they're on", () => {
    const result = step(withMedical(done("2026-11-01")), [
      load({ status: "loaded" }),
    ])
    assert.equal(result.tone, "danger")
    assert.equal(result.title, "Medical card expired")
    // Fixed on the Medical card card.
    assert.deepEqual(result.action, {
      type: "edit",
      label: "Update the medical card",
      target: "medical",
    })
  })

  it("shows the load they're on", () => {
    const result = step(current, [
      load({
        reference: "LATER",
        status: "booked",
        pickup_start: "2026-11-20T08:00:00",
      }),
      load({ reference: "NOW", status: "dispatched" }),
    ])
    assert.equal(result.title, "On load NOW")
  })

  it("warns about a document running out within 30 days", () => {
    const result = step({ ...current, cdl_expires_on: "2026-11-24" })
    assert.equal(result.title, "CDL expires in 9 days")
    assert.equal(result.action?.target, "cdl")
  })

  it("asks for missing expiration dates", () => {
    const result = step({ ...current, cdl_expires_on: null })
    assert.equal(result.title, "Add the CDL date")
    assert.equal(result.action?.target, "cdl")
  })

  it("calls a medical proof not done yet due, not expired", () => {
    const items = complianceItems(
      current,
      {
        ...current.dq,
        medical: { due: "2026-11-10", last: null, done: false },
      },
      TODAY
    )
    const medical = items.find((item) => item.key === "medical_card")
    assert.equal(medical.kind, "due")
    assert.equal(medical.expiry.state, "expired")
  })

  it("dates the yearly checks from the qualification file only", () => {
    const items = complianceItems(
      {
        ...current,
        // Left on older drivers from the Annual checks card; ignored now.
        last_annual_review_on: "2025-11-20",
        last_clearinghouse_query_on: "2024-02-29",
      },
      current.dq,
      TODAY
    )
    const review = items.find((item) => item.key === "annual_review")
    assert.equal(review.due, "2027-06-01")
    assert.equal(review.last, "2026-06-01")
    assert.equal(review.kind, "due")
    const query = items.find((item) => item.key === "clearinghouse")
    assert.equal(query.due, "2027-06-01")
    assert.equal(query.expiry.state, "ok")
  })

  it("sends an overdue yearly check to the qualification file", () => {
    const result = step({
      ...current,
      dq: {
        ...current.dq,
        annualReview: { due: "2026-01-10", last: "2025-01-10", done: false },
      },
    })
    assert.equal(result.title, "Annual review overdue")
    assert.equal(result.action?.target, "file")
    assert.match(
      result.detail,
      /until it's done, then record it in the qualification file/
    )
  })

  it("names the earliest booked load, or says they're free", () => {
    assert.equal(
      step(current, [
        load({
          reference: "B",
          status: "booked",
          pickup_start: "2026-11-22T08:00:00",
        }),
        load({
          reference: "A",
          status: "booked",
          pickup_start: "2026-11-18T08:00:00",
        }),
      ]).title,
      "Next up: load A"
    )
    assert.equal(step(current).action?.type, "new_load")
  })
})

describe("dqComplianceDates", () => {
  const item = (fields) => ({
    template_code: "annual_review",
    cycle_number: 1,
    completed_at: null,
    valid_until: null,
    due_date: null,
    not_applicable_reason: null,
    ...fields,
  })

  it("takes the latest cycle, and when it was last done", () => {
    const dates = dqComplianceDates([
      item({ completed_at: "2025-06-01T12:00:00Z", valid_until: "2026-06-01" }),
      item({ cycle_number: 2, due_date: "2026-06-01" }),
    ])
    assert.deepEqual(dates.annualReview, {
      due: "2026-06-01",
      last: "2025-06-01",
      done: false,
    })
  })

  it("uses the expiry of a completed medical proof", () => {
    const dates = dqComplianceDates([
      item({
        template_code: "medical_proof_cdl",
        completed_at: "2026-01-05T12:00:00Z",
        valid_until: "2027-01-05",
      }),
    ])
    assert.deepEqual(dates.medical, {
      due: "2027-01-05",
      last: "2026-01-05",
      done: true,
    })
  })

  it("is empty for a file that isn't set up, and skips items that don't apply", () => {
    const dates = dqComplianceDates([
      item({
        template_code: "medical_certificate",
        not_applicable_reason: "Doesn't apply",
      }),
    ])
    assert.deepEqual(dates, {
      medical: null,
      annualReview: null,
      clearinghouse: null,
    })
  })
})
