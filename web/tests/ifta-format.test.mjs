import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  defaultQuarter,
  dueDate,
  iftaSummary,
  loadMilesByTruck,
  parseQuarter,
  quarterLabel,
  quarterOf,
  quarterRange,
  recentQuarters,
  summaryCsv,
} from "../lib/ifta-format.ts"

describe("quarters", () => {
  it("knows which quarter a day is in", () => {
    assert.deepEqual(quarterOf("2026-01-01"), { year: 2026, quarter: 1 })
    assert.deepEqual(quarterOf("2026-06-30"), { year: 2026, quarter: 2 })
    assert.deepEqual(quarterOf("2026-11-27"), { year: 2026, quarter: 4 })
  })

  it("reads its URL key back and rejects others", () => {
    assert.deepEqual(parseQuarter("2026-Q3"), { year: 2026, quarter: 3 })
    assert.equal(parseQuarter("2026-Q5"), null)
    assert.equal(parseQuarter(undefined), null)
  })

  it("has the first and last day", () => {
    assert.deepEqual(quarterRange({ year: 2028, quarter: 1 }), {
      start: "2028-01-01",
      end: "2028-03-31",
    })
    assert.deepEqual(quarterRange({ year: 2026, quarter: 4 }), {
      start: "2026-10-01",
      end: "2026-12-31",
    })
  })

  it("is due the last day of the month after, Q4 in January", () => {
    assert.equal(dueDate({ year: 2026, quarter: 1 }), "2026-04-30")
    assert.equal(dueDate({ year: 2026, quarter: 2 }), "2026-07-31")
    assert.equal(dueDate({ year: 2026, quarter: 3 }), "2026-10-31")
    assert.equal(dueDate({ year: 2026, quarter: 4 }), "2027-01-31")
  })

  it("names the months", () => {
    assert.equal(
      quarterLabel({ year: 2026, quarter: 4 }, true),
      "Q4 2026 (Oct–Dec)"
    )
  })

  it("lists recent quarters across a year, newest first", () => {
    assert.deepEqual(
      recentQuarters("2026-02-10", 3).map((q) => quarterLabel(q)),
      ["Q1 2026", "Q4 2025", "Q3 2025"]
    )
  })

  it("opens on the quarter still to file, then the one in progress", () => {
    assert.deepEqual(defaultQuarter("2026-10-31"), { year: 2026, quarter: 3 })
    assert.deepEqual(defaultQuarter("2026-11-01"), { year: 2026, quarter: 4 })
    assert.deepEqual(defaultQuarter("2027-01-15"), { year: 2026, quarter: 4 })
  })
})

describe("iftaSummary", () => {
  it("works out MPG, taxable and net gallons by state", () => {
    const { lines, totalMiles, totalGallons, mpg } = iftaSummary(
      [
        { jurisdiction: "TX", miles: 3000 },
        { jurisdiction: "OK", miles: 1000 },
        { jurisdiction: "TX", miles: 1000 },
      ],
      [
        { jurisdiction: "TX", gallons: 600.5 },
        { jurisdiction: "AR", gallons: 199.5 },
      ]
    )
    assert.equal(totalMiles, 5000)
    assert.equal(totalGallons, 800)
    assert.equal(mpg, 6.25)
    assert.deepEqual(lines, [
      {
        jurisdiction: "AR",
        miles: 0,
        purchased: 199.5,
        taxable: 0,
        net: -199.5,
      },
      { jurisdiction: "OK", miles: 1000, purchased: 0, taxable: 160, net: 160 },
      {
        jurisdiction: "TX",
        miles: 4000,
        purchased: 600.5,
        taxable: 640,
        net: 39.5,
      },
    ])
  })

  it("leaves gallons blank without fuel to get an MPG from", () => {
    const { lines, mpg } = iftaSummary([{ jurisdiction: "TX", miles: 500 }], [])
    assert.equal(mpg, null)
    assert.equal(lines[0].taxable, null)
    assert.equal(lines[0].net, null)
  })

  it("writes CSV", () => {
    const { lines } = iftaSummary(
      [{ jurisdiction: "TX", miles: 600 }],
      [{ jurisdiction: "TX", gallons: 100 }]
    )
    assert.equal(
      summaryCsv(lines),
      "Jurisdiction,Miles,Taxable gallons,Gallons purchased,Net taxable gallons\nTX,600,100,100,0\n"
    )
  })
})

describe("loadMilesByTruck", () => {
  it("adds loaded and empty miles on loads delivered in the quarter", () => {
    const load = (delivered_on, miles, empty_miles, id = "t1") => ({
      delivered_on,
      miles,
      empty_miles,
      truck: id ? { id } : null,
    })
    assert.deepEqual(
      loadMilesByTruck(
        [
          load("2026-10-02", 500, 50),
          load("2026-12-31", 300, null),
          load("2026-09-30", 999, 0),
          load("2026-11-01", 400, 0, "t2"),
          load("2026-11-01", 100, 0, null),
        ],
        { year: 2026, quarter: 4 }
      ),
      { t1: 850, t2: 400 }
    )
  })
})
