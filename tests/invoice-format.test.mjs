import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  addressLines,
  balanceDue,
  brokerPaymentStats,
  billTo,
  daysBetween,
  formatInvoiceDate,
  formatTerms,
  invoiceState,
  packetFileName,
} from "../lib/invoice-format.ts"

describe("invoiceState", () => {
  it("is overdue the day after a sent invoice is due", () => {
    const sent = { status: "sent", due_on: "2026-12-15" }
    assert.equal(invoiceState(sent, "2026-12-15"), "sent")
    assert.equal(invoiceState(sent, "2026-12-16"), "overdue")
  })

  it("never calls a draft, paid or void invoice overdue", () => {
    for (const status of ["draft", "paid", "void"]) {
      assert.equal(
        invoiceState({ status, due_on: "2026-01-01" }, "2026-12-16"),
        status
      )
    }
  })
})

describe("part payments", () => {
  it("calls a sent invoice with money in partly paid", () => {
    assert.equal(
      invoiceState({ status: "sent", due_on: "2026-12-15", paid_amount: "500.00" }, "2026-12-01"),
      "partial"
    )
    assert.equal(
      invoiceState({ status: "sent", due_on: "2026-12-15", paid_amount: 0 }, "2026-12-01"),
      "sent"
    )
  })

  it("still calls it overdue once it's late", () => {
    assert.equal(
      invoiceState({ status: "sent", due_on: "2026-12-15", paid_amount: 500 }, "2026-12-16"),
      "overdue"
    )
  })

  it("works out what's left without going below zero", () => {
    assert.equal(balanceDue("2122.50", "1000.00"), 1122.5)
    assert.equal(balanceDue(1000, 1200), 0)
    assert.equal(balanceDue(0.3, 0.1), 0.2)
    assert.equal(balanceDue(null, null), 0)
  })
})

describe("daysBetween", () => {
  it("counts whole days across a month end", () => {
    assert.equal(daysBetween("2026-11-25", "2026-12-05"), 10)
    assert.equal(daysBetween("2026-12-05", "2026-11-25"), -10)
  })
})

describe("formatting", () => {
  it("formats dates without shifting by time zone", () => {
    assert.equal(formatInvoiceDate("2026-11-01"), "Nov 1, 2026")
  })

  it("calls 0 days due on receipt", () => {
    assert.equal(formatTerms(0), "Due on receipt")
    assert.equal(formatTerms(30), "Net 30")
  })

  it("skips blank address parts", () => {
    assert.deepEqual(
      addressLines({ line1: "12 Main St", line2: " ", city: "Dallas", state: "TX", postal_code: "75201" }),
      ["12 Main St", "Dallas, TX 75201"]
    )
    assert.deepEqual(addressLines({ state: "TX" }), ["TX"])
  })

  it("makes a safe packet file name", () => {
    assert.equal(packetFileName(1001, "AB 12/34"), "Invoice-1001-Load-AB-12-34.pdf")
    assert.equal(packetFileName(7, "///"), "Invoice-7.pdf")
  })
})

describe("billTo", () => {
  const broker = {
    legal_name: "Acme Logistics LLC",
    invoice_method: "email",
    billing_emails: ["ap@acme.com"],
    portal_url: null,
    factored: false,
  }
  const factoring = {
    name: "RTS Financial",
    submission_method: "portal",
    submission_emails: [],
    portal_url: "https://rts.example",
  }

  it("bills the broker by default", () => {
    const to = billTo("Acme", broker, factoring)
    assert.equal(to.kind, "broker")
    assert.deepEqual(to.emails, ["ap@acme.com"])
  })

  it("sends a factored broker's packet to the factoring company", () => {
    const to = billTo("Acme", { ...broker, factored: true }, factoring)
    assert.equal(to.kind, "factoring")
    assert.equal(to.name, "RTS Financial")
    assert.equal(to.method, "portal")
  })

  it("falls back to the broker when no factoring company is set up", () => {
    assert.equal(billTo("Acme", { ...broker, factored: true }, null).kind, "broker")
  })

  it("uses the typed-in name for a load with no linked broker", () => {
    const to = billTo("Walk-in Broker", null, factoring)
    assert.equal(to.name, "Walk-in Broker")
    assert.deepEqual(to.emails, [])
  })
})

describe("brokerPaymentStats", () => {
  const base = { invoice_date: "2026-10-01", total: "1000.00", paid_amount: 0, payments: [], due_on: "2026-10-31", paid_on: null }

  it("averages days to pay over paid invoices", () => {
    const stats = brokerPaymentStats(
      [
        { ...base, status: "paid", paid_on: "2026-10-21", paid_amount: 1000, payments: [{ paid_on: "2026-10-21", amount: 1000 }] },
        { ...base, status: "paid", paid_on: "2026-11-10", paid_amount: 1000, payments: [{ paid_on: "2026-11-10", amount: "1000.00" }] },
      ],
      "2026-11-15"
    )
    assert.equal(stats.avgDaysToPay, 30)
    assert.equal(stats.paidCount, 2)
    assert.deepEqual(stats.lastPayment, { paid_on: "2026-11-10", amount: 1000 })
  })

  it("adds up what's open and overdue by what's still owed", () => {
    const stats = brokerPaymentStats(
      [
        { ...base, status: "sent", due_on: "2026-12-01", paid_amount: "250.00" },
        { ...base, status: "sent", due_on: "2026-11-01" },
        { ...base, status: "draft", invoice_date: null, due_on: null },
        { ...base, status: "void" },
      ],
      "2026-11-15"
    )
    assert.deepEqual(stats.open, { count: 2, balance: 1750 })
    assert.deepEqual(stats.overdue, { count: 1, balance: 1000 })
    assert.equal(stats.avgDaysToPay, null)
    assert.equal(stats.lastPayment, null)
  })
})
