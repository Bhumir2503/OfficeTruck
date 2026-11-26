import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  brokerUpdateMessage,
  updateHistoryDetail,
  updateRecipients,
} from "../lib/broker-update-format.ts"

const stop = (overrides) => ({
  position: 1,
  kind: "pickup",
  facility: "Kroger DC",
  location: "Nashville, TN",
  stop_number: null,
  arrived_at: null,
  departed_at: null,
  arrived_source: null,
  departed_source: null,
  arrived_latitude: null,
  arrived_longitude: null,
  arrived_location_accuracy_m: null,
  departed_latitude: null,
  departed_longitude: null,
  departed_location_accuracy_m: null,
  ...overrides,
})

const base = {
  companyName: "Acme Freight",
  timeZone: "America/Chicago",
  reference: "SM-107",
  stopCount: 2,
  at: "2026-12-03T15:30:00Z",
}

describe("brokerUpdateMessage", () => {
  it("says a driver arrived, when, and where their phone was", () => {
    const message = brokerUpdateMessage({
      ...base,
      event: "arrived",
      stop: stop({
        stop_number: "PU-881",
        arrived_at: "2026-12-03T15:02:00Z",
        arrived_source: "driver",
        arrived_latitude: 36.16271,
        arrived_longitude: -86.78163,
        arrived_location_accuracy_m: 12.4,
      }),
    })
    assert.equal(message.subject, "Load SM-107: arrived at pickup 1 of 2")
    assert.deepEqual(message.lines, [
      "Arrived at pickup 1 of 2: Kroger DC, Nashville, TN.",
      "Pickup #: PU-881",
      "Time: Dec 3, 2026, 9:02 AM CST",
      "Driver's location (±12 m): https://www.google.com/maps/search/?api=1&query=36.16271,-86.78163",
    ])
    assert.equal(
      message.mapUrl,
      "https://www.google.com/maps/search/?api=1&query=36.16271,-86.78163"
    )
  })

  it("says when dispatch entered the time, with no map", () => {
    const message = brokerUpdateMessage({
      ...base,
      event: "departed",
      stop: stop({
        position: 2,
        kind: "delivery",
        facility: null,
        location: "Atlanta, GA",
        departed_at: "2026-12-03T23:15:00Z",
        departed_source: "office",
      }),
    })
    assert.equal(message.subject, "Load SM-107: left delivery 2 of 2")
    assert.deepEqual(message.lines, [
      "Left delivery 2 of 2: Atlanta, GA.",
      "Time: Dec 3, 2026, 5:15 PM CST",
      "Time entered by dispatch.",
    ])
    assert.equal(message.mapUrl, null)
  })

  it("says a load was delivered at its last stop", () => {
    const message = brokerUpdateMessage({
      ...base,
      event: "delivered",
      stop: stop({
        position: 2,
        kind: "delivery",
        location: "Atlanta, GA",
        facility: "Publix",
        arrived_at: "2026-12-03T22:00:00Z",
      }),
    })
    assert.equal(message.subject, "Load SM-107: delivered")
    assert.deepEqual(message.lines, [
      "Delivered at Publix, Atlanta, GA.",
      "Time: Dec 3, 2026, 4:00 PM CST",
    ])
  })

  it("never mentions money", () => {
    const message = brokerUpdateMessage({
      ...base,
      event: "arrived",
      stop: stop({ arrived_at: base.at, arrived_source: "driver" }),
    })
    const all = [message.subject, ...message.lines].join(" ")
    assert.doesNotMatch(all, /\$|rate|pay/i)
  })
})

describe("updateRecipients", () => {
  it("sends to dispatch contacts with an email, once each", () => {
    assert.deepEqual(
      updateRecipients(
        [
          { role: "dispatch", email: "Jen@TQL.com" },
          { role: "dispatch", email: "jen@tql.com" },
          { role: "billing", email: "ap@tql.com" },
          { role: "dispatch", email: null },
        ],
        "sender@tql.com"
      ),
      ["jen@tql.com"]
    )
  })

  it("falls back to whoever sent the rate con", () => {
    assert.deepEqual(
      updateRecipients(
        [{ role: "billing", email: "ap@tql.com" }],
        "Sam@TQL.com"
      ),
      ["sam@tql.com"]
    )
    assert.deepEqual(updateRecipients([], null), [])
  })
})

describe("updateHistoryDetail", () => {
  it("says what was sent and to whom", () => {
    assert.equal(
      updateHistoryDetail("Load SM-107: arrived at pickup 1 of 2", [
        "jen@tql.com",
      ]),
      "Update sent to the broker: arrived at pickup 1 of 2 (jen@tql.com)"
    )
  })
})
