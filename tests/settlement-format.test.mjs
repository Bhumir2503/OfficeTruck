import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  formatWeek,
  parseAdjustment,
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
    assert.deepEqual(weekRange("2026-11-16"), { from: "2026-11-16", to: "2026-11-23" })
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
