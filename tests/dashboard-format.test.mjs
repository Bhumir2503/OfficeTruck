import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildAttention,
  countActions,
  relativeDay,
  totalActions,
} from "../lib/dashboard-format.ts"

const today = "2026-11-16"
const empty = { today, invoices: [], ready: [], booked: [], documents: [] }

const invoice = (overrides = {}) => ({
  id: "i1",
  number: 1042,
  status: "sent",
  due_on: "2026-11-04",
  total: 2450,
  paid_amount: 0,
  load: { reference: "R1", broker_name: "Acme Logistics", rate: 2450 },
  ...overrides,
})

const doc = (state, days, overrides = {}) => ({
  owner: "Ana Ruiz",
  path: "drivers/d1",
  item: {
    key: "cdl",
    label: "CDL",
    kind: "expires",
    due: "2026-11-25",
    expiry: { state, days },
  },
  ...overrides,
})

describe("buildAttention", () => {
  it("lists an overdue invoice with what's left to pay", () => {
    const [item] = buildAttention({
      ...empty,
      invoices: [invoice({ paid_amount: 450 })],
    })
    assert.equal(item.kind, "overdue")
    assert.equal(item.tone, "danger")
    assert.equal(item.title, "Invoice #1042 is 12 days overdue")
    assert.match(item.detail, /\$2,000\.00 left/)
    assert.equal(item.path, "invoices/i1")
  })

  it("skips invoices that aren't late, and paid-off ones", () => {
    const items = buildAttention({
      ...empty,
      invoices: [
        invoice({ id: "a", due_on: "2026-11-20" }),
        invoice({ id: "b", paid_amount: 2450 }),
        invoice({ id: "c", status: "paid" }),
      ],
    })
    assert.equal(items.length, 0)
  })

  it("splits ready loads into missing a POD and ready to bill", () => {
    const load = {
      id: "l1",
      reference: "R1",
      broker_name: "Acme",
      rate: 1000,
      status: "delivered",
      delivery_start: "2026-11-15T10:00:00",
      missing: [],
    }
    const items = buildAttention({
      ...empty,
      ready: [
        load,
        { ...load, id: "l2", reference: "R2", missing: ["bol", "pod"] },
        { ...load, id: "l3", reference: "R3", missing: ["bol"] },
      ],
    })
    assert.deepEqual(
      items.map((i) => [i.kind, i.title]),
      [
        ["pod", "R2 needs its POD"],
        ["invoice_ready", "R1 is ready to invoice"],
      ]
    )
    assert.equal(items[0].tone, "warning")
  })

  it("warns about booked loads with no driver picking up soon", () => {
    const load = {
      id: "l1",
      reference: "R1",
      pickup_location: "Dallas, TX",
      pickup_start: "2026-11-17T08:00:00",
      driver_id: null,
      truck_id: "t1",
    }
    const items = buildAttention({
      ...empty,
      booked: [
        load,
        { ...load, id: "l2", pickup_start: "2026-11-30T08:00:00" },
        { ...load, id: "l3", driver_id: "d1" },
      ],
    })
    assert.equal(items.length, 1)
    assert.equal(items[0].title, "R1 needs a driver")
    assert.match(items[0].detail, /^Pickup tomorrow, Nov 17/)
  })

  it("lists late and soon documents, keeping acronyms", () => {
    const items = buildAttention({
      ...empty,
      documents: [
        doc("urgent", 5),
        doc("upcoming", 45),
        doc("missing"),
        doc("expired", 3, {
          owner: "Truck 101",
          path: "equipment/t1",
          item: {
            key: "registration",
            label: "Registration",
            kind: "expires",
            due: "2026-11-13",
            expiry: { state: "expired", days: 3 },
          },
        }),
      ],
    })
    assert.deepEqual(
      items.map((i) => i.title),
      ["Truck 101’s registration expired", "Ana Ruiz’s CDL expires"]
    )
  })

  it("puts the late things first", () => {
    const items = buildAttention({
      ...empty,
      invoices: [invoice({ status: "draft", due_on: null })],
      documents: [doc("expired", 1)],
    })
    assert.deepEqual(
      items.map((i) => i.tone),
      ["danger", "default"]
    )
  })
})

describe("countActions", () => {
  it("counts each kind and the total", () => {
    const counts = countActions(
      buildAttention({
        ...empty,
        invoices: [invoice(), invoice({ id: "i2", status: "draft" })],
      })
    )
    assert.equal(counts.overdue, 1)
    assert.equal(counts.invoice_ready, 1)
    assert.equal(totalActions(counts), 2)
  })
})

describe("relativeDay", () => {
  it("reads naturally", () => {
    assert.equal(relativeDay(0), "today")
    assert.equal(relativeDay(1), "tomorrow")
    assert.equal(relativeDay(-1), "yesterday")
    assert.equal(relativeDay(4), "in 4 days")
    assert.equal(relativeDay(-4), "4 days ago")
  })
})

describe("company documents", () => {
  it("reads naturally on the to-do list", () => {
    const [item] = buildAttention({
      ...empty,
      documents: [
        doc("soon", 20, {
          owner: "Company",
          path: "documents",
          item: {
            key: "company_document_1",
            label: "Insurance certificate",
            kind: "expires",
            due: "2026-12-06",
            expiry: { state: "soon", days: 20 },
          },
        }),
      ],
    })
    assert.equal(item.title, "The insurance certificate expires")
    assert.equal(item.path, "documents")
  })
})
