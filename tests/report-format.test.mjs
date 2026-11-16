import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  breakdown,
  cityState,
  inPeriod,
  monthlySeries,
  periodRange,
  totals,
} from "../lib/report-format.ts"

const load = (overrides = {}) => ({
  id: "l1",
  reference: "R1",
  status: "delivered",
  delivered_on: "2026-11-10",
  rate: 3000,
  miles: 1000,
  empty_miles: 100,
  driver_pay: 650,
  pay_unknown: false,
  expenses: 350,
  truck: { id: "t1", name: "101" },
  driver: { id: "d1", name: "Ana Ruiz" },
  broker: { id: "b1", name: "Acme Logistics" },
  origin: "Dallas, TX",
  destination: "Atlanta, GA",
  ...overrides,
})

describe("periodRange", () => {
  it("covers this month and last month", () => {
    assert.deepEqual(periodRange("this_month", "2026-11-16"), {
      from: "2026-11-01",
      to: "2026-12-01",
    })
    assert.deepEqual(periodRange("last_month", "2026-01-05"), {
      from: "2025-12-01",
      to: "2026-01-01",
    })
  })

  it("finds the quarter", () => {
    assert.deepEqual(periodRange("this_quarter", "2026-11-16"), {
      from: "2026-10-01",
      to: "2027-01-01",
    })
  })

  it("runs the last 12 months through the end of this one", () => {
    assert.deepEqual(periodRange("last_12_months", "2026-11-16"), {
      from: "2025-12-01",
      to: "2026-12-01",
    })
  })

  it("leaves all time open", () => {
    assert.equal(inPeriod(load({ delivered_on: "2019-01-01" }), "all", "2026-11-16"), true)
    assert.equal(inPeriod(load({ delivered_on: "2026-10-31" }), "this_month", "2026-11-16"), false)
  })
})

describe("cityState", () => {
  it("shortens a full address", () => {
    assert.equal(cityState("1200 Main St, Dallas, TX 75201, USA"), "Dallas, TX")
    assert.equal(cityState("Atlanta, GA"), "Atlanta, GA")
    assert.equal(cityState("Joliet, IL 60431-1234"), "Joliet, IL")
  })

  it("keeps a location it can't read", () => {
    assert.equal(cityState("Port of Savannah"), "Port of Savannah")
  })
})

describe("totals", () => {
  it("works out profit, margin and per-mile figures", () => {
    const t = totals([load(), load({ id: "l2", rate: 1000, miles: 400, empty_miles: 0, driver_pay: 260, expenses: 40 })])
    assert.equal(t.revenue, 4000)
    assert.equal(t.cost, 1300)
    assert.equal(t.profit, 2700)
    assert.equal(t.margin, 2700 / 4000)
    assert.equal(t.ratePerMile, 4000 / 1400)
    assert.equal(t.costPerMile, 1300 / 1500)
    assert.equal(t.emptyShare, 100 / 1500)
  })

  it("flags pay it couldn't work out and has no per-mile figures with no miles", () => {
    const t = totals([load({ miles: null, empty_miles: null, driver_pay: null, pay_unknown: true })])
    assert.equal(t.payUnknown, 1)
    assert.equal(t.noMiles, 1)
    assert.equal(t.ratePerMile, null)
    assert.equal(t.costPerMile, null)
    assert.equal(t.profit, 2650)
  })

  it("has no margin with nothing in it", () => {
    assert.equal(totals([]).margin, null)
  })
})

describe("breakdown", () => {
  it("groups by truck, most profitable first, with an unassigned row", () => {
    const rows = breakdown(
      [
        load(),
        load({ id: "l2", truck: { id: "t2", name: "102" }, rate: 9000 }),
        load({ id: "l3", truck: null }),
      ],
      "truck"
    )
    assert.deepEqual(rows.map((r) => r.name), ["102", "101", "No truck"])
    assert.equal(rows[0].id, "t2")
  })

  it("groups lanes by city pair regardless of case", () => {
    const rows = breakdown(
      [load(), load({ id: "l2", origin: "DALLAS, TX", destination: "ATLANTA, GA" })],
      "lane"
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].loads, 2)
  })
})

describe("monthlySeries", () => {
  it("has a point for every month, oldest first", () => {
    const points = monthlySeries([load(), load({ id: "l2", delivered_on: "2026-01-20" })], "2026-11-16")
    assert.equal(points.length, 12)
    assert.equal(points[0].month, "2025-12")
    assert.equal(points[11].month, "2026-11")
    assert.equal(points[11].revenue, 3000)
    assert.equal(points[11].profit, 2000)
    assert.equal(points[1].loads, 1)
  })
})
