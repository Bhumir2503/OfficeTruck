import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  addressLines,
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
