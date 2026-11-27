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
        ["invoice_ready", "R3 is ready to invoice"],
      ]
    )
    assert.equal(items[0].tone, "warning")
    // Missing paperwork other than the POD is named, not hidden.
    assert.match(items[2].detail, /Missing BOL$/)
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

describe("buildAttention: drivers and loads on the road", () => {
  const missing = (key, label, onLoad) => ({
    owner: "Kim Nguyen",
    path: "drivers/d2",
    onLoad,
    item: {
      key,
      label,
      kind: "expires",
      due: null,
      expiry: { state: "missing" },
    },
  })

  it("raises a missing CDL or medical card only for a driver with a load", () => {
    const items = buildAttention({
      ...empty,
      documents: [
        missing("medical_card", "Medical card", {
          reference: "SLL-40790",
          pickup_start: "2026-11-17T08:00:00",
        }),
        missing("cdl", "CDL", null),
        missing("annual_review", "Annual review", {
          reference: "SLL-40790",
          pickup_start: "2026-11-17T08:00:00",
        }),
      ],
    })
    assert.deepEqual(
      items.map((i) => [i.tone, i.title, i.detail]),
      [
        [
          "danger",
          "Kim Nguyen has no medical card on file",
          "Driving SLL-40790 · Add the date from the card",
        ],
      ]
    )
  })

  it("lists documents drivers sent for review", () => {
    const items = buildAttention({
      ...empty,
      driverUpdates: [
        {
          id: "u1",
          driver: "Terrell Banks",
          kind: "cdl",
          path: "drivers/d3",
          submitted_at: "2026-11-15T18:00:00Z",
        },
      ],
    })
    assert.equal(items[0].kind, "review")
    assert.equal(items[0].title, "Terrell Banks sent a new CDL to review")
    assert.equal(countActions(items).review, 1)
  })

  it("flags a dispatched load a day or more past pickup", () => {
    const load = {
      id: "l9",
      reference: "PPT-1",
      pickup_location: "Tulsa, OK",
      driver: "Dana Ortiz",
    }
    const items = buildAttention({
      ...empty,
      dispatched: [
        { ...load, pickup_start: "2026-11-09T08:00:00" },
        {
          ...load,
          id: "l10",
          reference: "PPT-2",
          pickup_start: "2026-11-16T06:00:00",
        },
      ],
    })
    assert.deepEqual(
      items.map((i) => [i.kind, i.title]),
      [["check_in", "PPT-1 hasn't picked up"]]
    )
    assert.match(items[0].detail, /7 days ago · Dana Ortiz, no check-in/)
  })
})

describe("buildAttention: compliance blockers", () => {
  const dated = (due, state, days, onLoad, owner = "Truck 103") => ({
    owner,
    path: "equipment/t3",
    onLoad,
    item: {
      key: "registration",
      label: "Registration",
      kind: "expires",
      due,
      expiry: { state, days },
    },
  })

  it("calls out a date that lapses before a load's pickup this week", () => {
    const items = buildAttention({
      ...empty,
      documents: [
        dated("2026-11-20", "urgent", 4, {
          reference: "BFB-1",
          pickup_start: "2026-11-22T07:00:00",
        }),
      ],
    })
    assert.deepEqual(
      items.map((i) => [i.tone, i.title, i.detail]),
      [
        [
          "danger",
          "Truck 103 can't legally run BFB-1",
          "Registration expires Nov 20, before pickup Nov 22",
        ],
      ]
    )
  })

  it("calls out a lapsed date on the load it's running", () => {
    const items = buildAttention({
      ...empty,
      documents: [
        dated("2026-11-10", "expired", 6, {
          reference: "SLL-9",
          pickup_start: "2026-11-15T07:00:00",
        }),
      ],
    })
    assert.equal(items[0].title, "Truck 103 can't legally run SLL-9")
    assert.equal(items[0].detail, "Registration expired Nov 10")
  })

  it("leaves a date that outlasts the pickup, or a load further out, as a normal reminder", () => {
    const items = buildAttention({
      ...empty,
      documents: [
        dated("2026-11-30", "soon", 14, {
          reference: "A",
          pickup_start: "2026-11-20T07:00:00",
        }),
        dated(
          "2026-11-20",
          "urgent",
          4,
          { reference: "B", pickup_start: "2026-12-01T07:00:00" },
          "Truck 104"
        ),
      ],
    })
    assert.deepEqual(
      items.map((i) => i.title),
      ["Truck 104’s registration expires", "Truck 103’s registration expires"]
    )
  })
})
