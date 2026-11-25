import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  formatPeriod,
  formatWeek,
  parseAdjustment,
  parsePeriod,
  periodEnd,
  periodOf,
  periodRange,
  shiftPeriod,
  parseWeek,
  settlementTotals,
  shiftWeek,
  weekOf,
  weekRange,
} from "../lib/settlement-format.ts"

describe("weeks", () => {
  it("starts on Monday", () => {
    assert.equal(weekOf("2026-11-16"), "2026-11-16") // Monday
    assert.equal(weekOf("2026-11-22"), "2026-11-16") // Sunday
    assert.equal(weekOf("2026-11-23"), "2026-11-23")
  })

  it("moves by whole weeks and covers seven days", () => {
    assert.equal(shiftWeek("2026-11-16", -1), "2026-11-09")
    assert.equal(shiftWeek("2026-12-28", 1), "2027-01-04")
    assert.deepEqual(weekRange("2026-11-16"), {
      from: "2026-11-16",
      to: "2026-11-23",
    })
  })

  it("only accepts a real Monday", () => {
    assert.equal(parseWeek("2026-11-16"), "2026-11-16")
    assert.equal(parseWeek("2026-11-17"), null)
    assert.equal(parseWeek("2026-02-30"), null)
    assert.equal(parseWeek(undefined), null)
  })

  it("reads naturally", () => {
    assert.equal(formatWeek("2026-11-16"), "Nov 16 – 22, 2026")
    assert.equal(formatWeek("2026-11-30"), "Nov 30 – Dec 6, 2026")
    assert.equal(formatWeek("2026-12-28"), "Dec 28, 2026 – Jan 3, 2027")
  })
})

describe("settlementTotals", () => {
  it("adds pay, money owed back and adjustments", () => {
    const totals = settlementTotals(
      [
        { pay: 650, miles: 1000 },
        { pay: 367.2, miles: 612 },
        { pay: null, miles: null },
      ],
      [{ amount: 100 }, { amount: 42.5 }],
      [{ amount: -200 }, { amount: 50 }]
    )
    assert.equal(totals.loads, 3)
    assert.equal(totals.miles, 1612)
    assert.equal(totals.gross, 1017.2)
    assert.equal(totals.reimbursements, 142.5)
    assert.equal(totals.adjustments, -150)
    assert.equal(totals.net, 1009.7)
    assert.equal(totals.unpriced, 1)
  })
})

describe("parseAdjustment", () => {
  it("signs the amount by direction", () => {
    assert.deepEqual(parseAdjustment("$1,500.00", "deduct"), { amount: -1500 })
    assert.deepEqual(parseAdjustment("75", "add"), { amount: 75 })
    assert.deepEqual(parseAdjustment("-75", "add"), { amount: 75 })
  })

  it("rejects nonsense and zero", () => {
    assert.ok("error" in parseAdjustment("abc", "add"))
    assert.ok("error" in parseAdjustment("0", "deduct"))
  })
})

describe("pay periods", () => {
  it("keeps weeks Monday to Sunday", () => {
    assert.equal(periodOf("2026-11-22", "week"), "2026-11-16")
    assert.equal(periodEnd("2026-11-16", "week"), "2026-11-22")
    assert.equal(shiftPeriod("2026-11-16", "week", -1), "2026-11-09")
  })

  it("pairs weeks into 2-week blocks that don't drift", () => {
    const start = periodOf("2026-11-24", "two_weeks")
    // Both weeks of a block share its start.
    assert.equal(periodOf(start, "two_weeks"), start)
    assert.equal(periodOf(shiftPeriod(start, "week", 1), "two_weeks"), start)
    assert.equal(
      periodRange(start, "two_weeks").to,
      shiftPeriod(start, "week", 2)
    )
    // Stepping back lands on another block start, however far.
    const earlier = shiftPeriod(start, "two_weeks", -26)
    assert.equal(periodOf(earlier, "two_weeks"), earlier)
    assert.equal(parsePeriod(shiftPeriod(start, "week", 1), "two_weeks"), null)
  })

  it("runs months from the 1st to the last day", () => {
    assert.equal(periodOf("2026-11-24", "month"), "2026-11-01")
    assert.equal(periodEnd("2026-11-01", "month"), "2026-11-30")
    assert.equal(periodEnd("2028-02-01", "month"), "2028-02-29")
    assert.equal(shiftPeriod("2026-12-01", "month", 1), "2027-01-01")
    assert.equal(shiftPeriod("2026-01-01", "month", -1), "2025-12-01")
    assert.deepEqual(periodRange("2026-11-01", "month"), {
      from: "2026-11-01",
      to: "2026-12-01",
    })
    assert.equal(parsePeriod("2026-11-02", "month"), null)
    assert.equal(parsePeriod("2026-11-01", "month"), "2026-11-01")
  })

  it("labels a period by its first and last day", () => {
    assert.equal(formatPeriod("2026-11-01", "2026-11-30"), "Nov 1 – 30, 2026")
    assert.equal(
      formatPeriod("2026-11-23", "2026-12-06"),
      "Nov 23 – Dec 6, 2026"
    )
    assert.equal(
      formatPeriod("2026-12-28", "2027-01-10"),
      "Dec 28, 2026 – Jan 10, 2027"
    )
  })
})
