import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  breakdown,
  change,
  cityState,
  inOverview,
  inPeriod,
  monthlySeries,
  monthToDate,
  overview,
  overviewStart,
  periodRange,
  totals,
  weeklySeries,
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
    assert.equal(
      inPeriod(load({ delivered_on: "2019-01-01" }), "all", "2026-11-16"),
      true
    )
    assert.equal(
      inPeriod(
        load({ delivered_on: "2026-10-31" }),
        "this_month",
        "2026-11-16"
      ),
      false
    )
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
    const t = totals([
      load(),
      load({
        id: "l2",
        rate: 1000,
        miles: 400,
        empty_miles: 0,
        driver_pay: 260,
        expenses: 40,
      }),
    ])
    assert.equal(t.revenue, 4000)
    assert.equal(t.cost, 1300)
    assert.equal(t.profit, 2700)
    assert.equal(t.margin, 2700 / 4000)
    assert.equal(t.ratePerMile, 4000 / 1400)
    assert.equal(t.costPerMile, 1300 / 1500)
    assert.equal(t.emptyShare, 100 / 1500)
  })

  it("flags pay it couldn't work out and has no per-mile figures with no miles", () => {
    const t = totals([
      load({
        miles: null,
        empty_miles: null,
        driver_pay: null,
        pay_unknown: true,
      }),
    ])
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
    assert.deepEqual(
      rows.map((r) => r.name),
      ["102", "101", "No truck"]
    )
    assert.equal(rows[0].id, "t2")
  })

  it("groups lanes by city pair regardless of case", () => {
    const rows = breakdown(
      [
        load(),
        load({ id: "l2", origin: "DALLAS, TX", destination: "ATLANTA, GA" }),
      ],
      "lane"
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].loads, 2)
  })
})

describe("monthlySeries", () => {
  it("has a point for every month, oldest first", () => {
    const points = monthlySeries(
      [load(), load({ id: "l2", delivered_on: "2026-01-20" })],
      "2026-11-16",
      12
    )
    assert.equal(points.length, 12)
    assert.equal(points[0].start, "2025-12-01")
    assert.equal(points[0].fullLabel, "Dec 2025")
    assert.equal(points[11].start, "2026-11-01")
    assert.equal(points[11].revenue, 3000)
    assert.equal(points[11].driverPay, 650)
    assert.equal(points[11].expenses, 350)
    assert.equal(points[11].profit, 2000)
    assert.equal(points[1].loads, 1)
  })

  it("leaves out deliveries after today", () => {
    const points = monthlySeries(
      [load({ delivered_on: "2026-11-20" })],
      "2026-11-16",
      1
    )
    assert.equal(points[0].loads, 0)
  })
})

describe("weeklySeries", () => {
  it("has a point for every week, Monday to Sunday, oldest first", () => {
    // 2026-11-18 is a Wednesday; its week starts Monday the 16th.
    const points = weeklySeries(
      [
        load({ delivered_on: "2026-11-16" }),
        load({ id: "l2", delivered_on: "2026-11-15" }),
        load({ id: "l3", delivered_on: "2026-10-26" }),
        load({ id: "l4", delivered_on: "2026-10-25" }),
        load({ id: "l5", delivered_on: "2026-11-19" }),
      ],
      "2026-11-18",
      4
    )
    assert.deepEqual(
      points.map((p) => [p.start, p.loads]),
      [
        ["2026-10-26", 1],
        ["2026-11-02", 0],
        ["2026-11-09", 1],
        ["2026-11-16", 1],
      ]
    )
    assert.equal(points[3].label, "Nov 16")
    assert.equal(points[3].fullLabel, "Week of Nov 16")
    assert.equal(points[3].revenue, 3000)
    assert.equal(points[3].profit, 2000)
  })

  it("starts the week on Monday when today is a Sunday", () => {
    const points = weeklySeries([], "2026-11-22", 1)
    assert.equal(points[0].start, "2026-11-16")
  })
})

describe("overview", () => {
  it("charts 5 weeks, 13 weeks or 12 months", () => {
    assert.equal(overview([], "2026-11-18", "30days").points.length, 5)
    assert.equal(overview([], "2026-11-18", "3months").points.length, 13)
    assert.equal(overview([], "2026-11-18", "1year").points.length, 12)
  })

  it("totals the period and the same stretch before it", () => {
    const { total, previous } = overview(
      [
        load({ delivered_on: "2026-11-10" }),
        load({ id: "l2", delivered_on: "2026-06-10", rate: 1000 }),
        load({ id: "l3", delivered_on: "2025-06-10", rate: 500 }),
      ],
      "2026-11-18",
      "1year"
    )
    assert.equal(total.revenue, 4000)
    assert.equal(total.loads, 2)
    assert.equal(previous.revenue, 500)
  })
})

describe("monthToDate", () => {
  it("compares this month so far with the same days last month", () => {
    const { current, previous } = monthToDate(
      [
        load({ delivered_on: "2026-11-10" }),
        load({ id: "l2", delivered_on: "2026-10-05" }),
        load({ id: "l3", delivered_on: "2026-10-20", rate: 9999 }),
      ],
      "2026-11-12"
    )
    assert.equal(current.loads, 1)
    assert.equal(previous.loads, 1)
    assert.equal(previous.revenue, 3000)
  })

  it("stops at the last day of a shorter month", () => {
    const { previous } = monthToDate(
      [
        load({ delivered_on: "2026-02-28" }),
        load({ id: "l2", delivered_on: "2026-03-01" }),
      ],
      "2026-03-31"
    )
    // Last month is February: all of it counts, none of March.
    assert.equal(previous.loads, 1)
  })
})

describe("change", () => {
  it("is the fraction up or down, or null with nothing to compare to", () => {
    assert.equal(change(150, 100), 0.5)
    assert.equal(change(50, 100), -0.5)
    assert.equal(change(-50, -100), 0.5)
    assert.equal(change(100, 0), null)
    assert.equal(change(null, 100), null)
  })
})

describe("overviewStart", () => {
  it("starts where the charts start", () => {
    // 2026-11-18 is a Wednesday; its week starts Monday the 16th.
    assert.equal(overviewStart("2026-11-18", "30days"), "2026-10-19")
    assert.equal(overviewStart("2026-11-18", "3months"), "2026-08-24")
    assert.equal(overviewStart("2026-11-18", "1year"), "2025-12-01")
  })
})

describe("inOverview", () => {
  it("counts loads from the start through today", () => {
    const today = "2026-11-18"
    assert.equal(
      inOverview(load({ delivered_on: "2026-10-19" }), today, "30days"),
      true
    )
    assert.equal(
      inOverview(load({ delivered_on: "2026-10-18" }), today, "30days"),
      false
    )
    assert.equal(
      inOverview(load({ delivered_on: "2026-11-19" }), today, "30days"),
      false
    )
    assert.equal(
      inOverview(load({ delivered_on: "2026-01-05" }), today, "1year"),
      true
    )
  })
})
