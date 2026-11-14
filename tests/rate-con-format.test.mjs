import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  cleanAmount,
  cleanMc,
  matchBroker,
  rateConToForm,
  toWallClock,
} from "../lib/rate-con-format.ts"

/** Everything empty, as when nothing could be read. */
const empty = {
  load_number: null,
  reference_numbers: [],
  broker_name: null,
  broker_mc_number: null,
  sender_email: null,
  equipment: null,
  commodity: null,
  weight_lbs: null,
  trailer_number: null,
  stops: [],
  charges: [],
  detention_free_hours: null,
  detention_hourly_rate: null,
}

const brokers = [
  { id: "b-1", legal_name: "Prairie Freight Brokers, LLC", dba_name: null, mc_number: "0123456" },
  { id: "b-2", legal_name: "Blue Ridge Logistics Inc.", dba_name: "Blue Ridge", mc_number: null },
]

describe("toWallClock", () => {
  it("keeps the form's own format", () => {
    assert.equal(toWallClock("2026-11-14T08:00"), "2026-11-14T08:00")
  })

  it("drops seconds and a time zone, keeping the time as written", () => {
    assert.equal(toWallClock("2026-11-14T08:00:00"), "2026-11-14T08:00")
    assert.equal(toWallClock("2026-11-14T08:00:00-05:00"), "2026-11-14T08:00")
    assert.equal(toWallClock("2026-11-14T13:00:00Z"), "2026-11-14T13:00")
  })

  it("takes a space between date and time, and single-digit hours", () => {
    assert.equal(toWallClock("2026-11-14 8:30"), "2026-11-14T08:30")
  })

  it("reads US dates with 12- and 24-hour times", () => {
    assert.equal(toWallClock("11/14/2026 8:00 AM"), "2026-11-14T08:00")
    assert.equal(toWallClock("11/14/2026 12:15 pm"), "2026-11-14T12:15")
    assert.equal(toWallClock("11/14/2026 12:00 AM"), "2026-11-14T00:00")
    assert.equal(toWallClock("1/5/2027, 14:30"), "2027-01-05T14:30")
  })

  it("leaves the time blank for a date alone, rather than making one up", () => {
    assert.equal(toWallClock("2026-11-14"), "2026-11-14T")
    assert.equal(toWallClock("11/14/2026"), "2026-11-14T")
  })

  it("returns null for anything it can't read", () => {
    for (const value of [null, undefined, "", "tomorrow", "2026-13-01", "2026-02-30", "2026-11-14T25:00", "11/14/2026 13:00 PM", 42]) {
      assert.equal(toWallClock(value), null, String(value))
    }
  })
})

describe("cleanMc and matchBroker", () => {
  it("strips the MC prefix and leading zeros", () => {
    assert.equal(cleanMc("MC-0123456"), "123456")
    assert.equal(cleanMc("MC# 123456"), "123456")
    assert.equal(cleanMc("none"), null)
  })

  it("matches by MC number first", () => {
    assert.equal(matchBroker(brokers, "Someone Else", "MC 123456")?.id, "b-1")
  })

  it("then by legal or DBA name, ignoring case, punctuation and Inc./LLC", () => {
    assert.equal(matchBroker(brokers, "PRAIRIE FREIGHT BROKERS", null)?.id, "b-1")
    assert.equal(matchBroker(brokers, "Blue Ridge Logistics, Inc", null)?.id, "b-2")
    assert.equal(matchBroker(brokers, "Blue Ridge", "999999")?.id, "b-2")
  })

  it("returns null when nothing matches", () => {
    assert.equal(matchBroker(brokers, "Unknown Brokerage", "555"), null)
    assert.equal(matchBroker(brokers, null, null), null)
  })
})

describe("cleanAmount", () => {
  it("rounds to cents and refuses negatives and non-numbers", () => {
    assert.equal(cleanAmount(2450.499), 2450.5)
    assert.equal(cleanAmount(-5), null)
    assert.equal(cleanAmount(Number.NaN), null)
    assert.equal(cleanAmount("2450"), null)
  })
})

describe("rateConToForm", () => {
  it("fills nothing and marks nothing when the rate con had nothing", () => {
    const fill = rateConToForm(empty, brokers)
    assert.deepEqual(fill.filled, [])
    assert.equal(fill.reference, null)
    assert.equal(fill.broker, null)
    assert.equal(fill.stops, null)
    assert.equal(fill.charges, null)
    assert.equal(fill.detention, null)
    assert.deepEqual(fill.freight, {
      reference_numbers: null,
      equipment: null,
      commodity: null,
      weight_lbs: null,
      trailer_number: null,
    })
  })

  it("fills a full rate con and marks each part", () => {
    const fill = rateConToForm(
      {
        load_number: " 4471023 ",
        reference_numbers: ["PO 88213", " ", "SO 4471"],
        broker_name: "Prairie Freight Brokers LLC",
        broker_mc_number: "MC-123456",
        sender_email: "Dispatch@PrairieFreight.example",
        equipment: "reefer",
        commodity: "Frozen vegetables",
        weight_lbs: 41999.6,
        trailer_number: null,
        stops: [
          { kind: "pickup", address: "Cold Store, 1 Ice Rd, Fargo, ND", appointment_start: "2026-11-14T06:00", appointment_end: "2026-11-14T10:00", number: "PU-77" },
          { kind: "delivery", address: "Market DC, 9 Elm St, Denver, CO", appointment_start: "11/16/2026", appointment_end: null, number: null },
        ],
        charges: [
          { kind: "linehaul", description: null, amount: 2300 },
          { kind: "fuel_surcharge", description: null, amount: 412.5 },
        ],
        detention_free_hours: 2,
        detention_hourly_rate: 50,
      },
      brokers
    )
    assert.equal(fill.reference, "4471023")
    assert.equal(fill.freight.reference_numbers, "PO 88213, SO 4471")
    assert.equal(fill.freight.equipment, "reefer")
    assert.equal(fill.freight.weight_lbs, 42000)
    assert.equal(fill.freight.trailer_number, null)
    assert.deepEqual(fill.broker, {
      brokerId: "b-1",
      brokerName: "Prairie Freight Brokers, LLC",
      sender: "dispatch@prairiefreight.example",
    })
    assert.deepEqual(fill.stops, [
      { kind: "pickup", location: "Cold Store, 1 Ice Rd, Fargo, ND", appointment_start: "2026-11-14T06:00", appointment_end: "2026-11-14T10:00", stop_number: "PU-77" },
      { kind: "delivery", location: "Market DC, 9 Elm St, Denver, CO", appointment_start: "2026-11-16T", appointment_end: null, stop_number: null },
    ])
    assert.deepEqual(fill.charges, [
      { kind: "linehaul", description: null, amount: 2300 },
      { kind: "fuel_surcharge", description: null, amount: 412.5 },
    ])
    assert.deepEqual(fill.detention, { free_hours: 2, rate: 50 })
    assert.deepEqual(fill.filled.sort(), [
      "broker", "charges", "commodity", "detention", "equipment", "rate_con_from",
      "reference", "reference_numbers", "stops", "weight_lbs",
    ])
  })

  it("types the broker's name when they aren't in the list", () => {
    const fill = rateConToForm({ ...empty, broker_name: "New Broker Co", sender_email: "not an email" }, brokers)
    assert.deepEqual(fill.broker, { brokerId: null, brokerName: "New Broker Co", sender: null })
    assert.deepEqual(fill.filled, ["broker"])
  })

  it("keeps each charge kind and drops lines with no usable amount", () => {
    const fill = rateConToForm(
      {
        ...empty,
        charges: [
          { kind: "linehaul", description: null, amount: 1800 },
          { kind: "fuel_surcharge", description: null, amount: null },
          { kind: "lumper", description: "Lumper at delivery", amount: 150 },
          { kind: "stop_off", description: null, amount: 75.005 },
          { kind: "other", description: "Tarp", amount: -10 },
        ],
      },
      brokers
    )
    assert.deepEqual(fill.charges, [
      { kind: "linehaul", description: null, amount: 1800 },
      { kind: "lumper", description: "Lumper at delivery", amount: 150 },
      { kind: "stop_off", description: null, amount: 75.01 },
    ])
  })

  it("leaves out a window end that has no time or comes before the start", () => {
    const fill = rateConToForm(
      {
        ...empty,
        stops: [
          { kind: "pickup", address: "A", appointment_start: "2026-11-14T10:00", appointment_end: "2026-11-14T09:00", number: null },
          { kind: "delivery", address: "B", appointment_start: "2026-11-15T08:00", appointment_end: "2026-11-15", number: null },
          { kind: "delivery", address: null, appointment_start: "garbage", appointment_end: null, number: "X" },
        ],
      },
      brokers
    )
    assert.equal(fill.stops.length, 2)
    assert.equal(fill.stops[0].appointment_end, null)
    assert.equal(fill.stops[1].appointment_end, null)
  })

  it("keeps half of the detention terms for the person to finish", () => {
    const fill = rateConToForm({ ...empty, detention_free_hours: 2.04, detention_hourly_rate: null }, brokers)
    assert.deepEqual(fill.detention, { free_hours: 2, rate: null })
  })

  it("drops a weight it can't use", () => {
    assert.equal(rateConToForm({ ...empty, weight_lbs: 900000 }, brokers).freight.weight_lbs, null)
    assert.equal(rateConToForm({ ...empty, weight_lbs: 0 }, brokers).freight.weight_lbs, null)
  })
})
