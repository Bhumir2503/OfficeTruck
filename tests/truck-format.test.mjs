import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  owes2290,
  pmItem,
  pmStatus,
  taxItem,
  truckServiceItem,
} from "../lib/truck-format.ts"

const TODAY = "2026-11-21"

/** A truck with a service schedule; anything can be overridden. */
const truck = (overrides = {}) => ({
  pm_interval_miles: 15000,
  pm_interval_days: 90,
  odometer: 400000,
  ...overrides,
})

describe("owes2290", () => {
  it("applies at 55,000 lbs and up", () => {
    assert.equal(owes2290({ registered_weight_lbs: 55000 }), true)
    assert.equal(owes2290({ registered_weight_lbs: 80000 }), true)
  })

  it("doesn't apply under 55,000 lbs", () => {
    assert.equal(owes2290({ registered_weight_lbs: 54999 }), false)
    assert.equal(owes2290({ registered_weight_lbs: 26000 }), false)
  })

  it("assumes it applies when no weight is on file", () => {
    assert.equal(owes2290({ registered_weight_lbs: null }), true)
  })
})

describe("taxItem", () => {
  const filings = [{ tax_year: 2026, truck_ids: ["t1"] }]

  it("is due next August once this year's return covers the truck", () => {
    const item = taxItem("t1", filings, TODAY)
    assert.equal(item.covered, true)
    assert.equal(item.due, "2027-08-31")
  })

  it("is overdue when this year's return doesn't list the truck", () => {
    const item = taxItem("t2", filings, TODAY)
    assert.equal(item.covered, false)
    assert.equal(item.due, "2026-08-31")
    assert.equal(item.expiry.state, "expired")
  })
})

describe("pmStatus", () => {
  it("is unscheduled without an interval", () => {
    const pm = pmStatus(
      truck({ pm_interval_miles: null, pm_interval_days: null }),
      { done_on: "2026-11-01", odometer: 399000 },
      TODAY
    )
    assert.equal(pm.state, "unscheduled")
  })

  it("waits for a first service to be logged", () => {
    assert.equal(pmStatus(truck(), null, TODAY).state, "no_history")
  })

  it("is ok well inside both the miles and the days", () => {
    const pm = pmStatus(truck(), { done_on: "2026-11-01", odometer: 399000 }, TODAY)
    assert.equal(pm.state, "ok")
    assert.equal(pm.dueOn, "2027-01-30")
    assert.equal(pm.dueAtMiles, 414000)
    assert.equal(pm.milesLeft, 14000)
  })

  it("is due when the mileage is past, even with days to spare", () => {
    const pm = pmStatus(truck(), { done_on: "2026-11-01", odometer: 380000 }, TODAY)
    assert.equal(pm.state, "due")
    assert.equal(pm.milesLeft, -5000)
  })

  it("is due when the date is past, even with miles to spare", () => {
    const pm = pmStatus(truck(), { done_on: "2026-08-01", odometer: 399000 }, TODAY)
    assert.equal(pm.dueOn, "2026-10-30")
    assert.equal(pm.state, "due")
  })

  it("is soon within 1,000 miles", () => {
    const pm = pmStatus(truck(), { done_on: "2026-11-01", odometer: 385500 }, TODAY)
    assert.equal(pm.milesLeft, 500)
    assert.equal(pm.state, "soon")
  })

  it("is soon within 14 days", () => {
    const pm = pmStatus(truck(), { done_on: "2026-08-30", odometer: 399000 }, TODAY)
    assert.equal(pm.dueOn, "2026-11-28")
    assert.equal(pm.state, "soon")
  })

  it("counts by days alone when the last service has no odometer", () => {
    const pm = pmStatus(truck(), { done_on: "2026-11-01", odometer: null }, TODAY)
    assert.equal(pm.dueAtMiles, null)
    assert.equal(pm.milesLeft, null)
    assert.equal(pm.state, "ok")
  })
})

describe("pmItem", () => {
  it("is nothing while service is fine", () => {
    const pm = pmStatus(truck(), { done_on: "2026-11-01", odometer: 399000 }, TODAY)
    assert.equal(pmItem(pm, TODAY), null)
  })

  it("is nothing before any service is logged", () => {
    assert.equal(pmItem(pmStatus(truck(), null, TODAY), TODAY), null)
  })

  it("is overdue by date with the date it was due", () => {
    const pm = pmStatus(truck(), { done_on: "2026-08-01", odometer: 399000 }, TODAY)
    const item = pmItem(pm, TODAY)
    assert.equal(item.label, "Service")
    assert.equal(item.due, "2026-10-30")
    assert.equal(item.expiry.state, "expired")
    assert.equal(item.whenText, undefined)
  })

  it("is overdue by miles with how far over, and no date", () => {
    const pm = pmStatus(truck(), { done_on: "2026-11-01", odometer: 380000 }, TODAY)
    const item = pmItem(pm, TODAY)
    assert.equal(item.due, null)
    assert.equal(item.expiry.state, "expired")
    assert.equal(item.whenText, "5,000 mi over")
  })

  it("is coming up by miles with how far to go", () => {
    const pm = pmStatus(truck(), { done_on: "2026-11-01", odometer: 385500 }, TODAY)
    const item = pmItem(pm, TODAY)
    assert.equal(item.due, null)
    assert.equal(item.expiry.state, "urgent")
    assert.equal(item.whenText, "in 500 mi")
  })

  it("is coming up by date with the date", () => {
    const pm = pmStatus(truck(), { done_on: "2026-08-30", odometer: 399000 }, TODAY)
    const item = pmItem(pm, TODAY)
    assert.equal(item.due, "2026-11-28")
    assert.equal(item.expiry.state, "urgent")
  })
})

describe("truckServiceItem", () => {
  it("works from a truck and its last service", () => {
    const item = truckServiceItem(
      truck(),
      { done_on: "2026-11-01", odometer: 380000 },
      TODAY
    )
    assert.equal(item.whenText, "5,000 mi over")
  })

  it("is nothing when the truck has no service logged", () => {
    assert.equal(truckServiceItem(truck(), undefined, TODAY), null)
  })
})
