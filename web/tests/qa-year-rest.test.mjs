import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { expenseTotals } from "../lib/load-expense-format.ts"
import { formatStopDate } from "../lib/load-format.ts"
import { settlementTotals } from "../lib/settlement-format.ts"

describe("formatStopDate", () => {
  it("leaves the year off this year's dates", () => {
    assert.equal(formatStopDate("2026-12-03T08:00:00", 2026), "Dec 3")
  })

  it("shows the year on any other year's", () => {
    assert.equal(formatStopDate("2025-12-03T08:00:00", 2026), "Dec 3, 2025")
    assert.equal(formatStopDate("2027-01-04T08:00:00", 2026), "Jan 4, 2027")
  })
})

describe("expenseTotals with deductions", () => {
  it("counts a deduction as spent but not as the company's cost", () => {
    const totals = expenseTotals([
      { amount: 500, paid_by: "deduct" },
      { amount: 40, paid_by: "driver" },
      { amount: 20, paid_by: "company" },
    ])
    assert.deepEqual(totals, {
      total: 560,
      owedToDriver: 40,
      deducted: 500,
      companyCost: 60,
    })
  })
})

describe("settlementTotals with deductions", () => {
  it("takes a deducted expense off net pay", () => {
    const totals = settlementTotals(
      [{ pay: 2000, miles: 800 }],
      [{ amount: 40 }, { amount: -500 }],
      []
    )
    assert.equal(totals.reimbursements, -460)
    assert.equal(totals.net, 1540)
  })
})
