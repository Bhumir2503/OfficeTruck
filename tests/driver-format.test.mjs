import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  complianceItems,
  driverEarnings,
  driverNextStep,
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

const current = {
  cdl_expires_on: "2028-01-01",
  medical_card_expires_on: "2028-01-01",
  annual_review_on: "2026-06-01",
  clearinghouse_query_on: "2026-06-01",
}
const active = { full_name: "Ana Torres", status: "active" }

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

describe("driverNextStep", () => {
  const step = (dates, loads = [], driver = active) =>
    driverNextStep(driver, complianceItems(dates, TODAY), loads)

  it("asks to bring an inactive driver back, whatever else is due", () => {
    const result = step({ ...current, cdl_expires_on: "2026-01-01" }, [], {
      ...active,
      status: "inactive",
    })
    assert.equal(result.action?.type, "activate")
  })

  it("puts a lapsed document ahead of the load they're on", () => {
    const result = step({ ...current, medical_card_expires_on: "2026-11-01" }, [
      load({ status: "loaded" }),
    ])
    assert.equal(result.tone, "danger")
    assert.equal(result.title, "Medical card expired")
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
  })

  it("asks for missing expiration dates", () => {
    const result = step({ ...current, cdl_expires_on: null })
    assert.equal(result.title, "Add the CDL date")
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
