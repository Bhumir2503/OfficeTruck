import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { detentionClock, stopDetention } from "../lib/load-format.ts"

const terms = { detention_free_hours: 2, detention_rate: 75 }
const arrived = "2026-12-03T15:00:00Z"
const at = (time) => Date.parse(`2026-12-03T${time}:00Z`)

describe("detentionClock", () => {
  it("counts down the free time while the driver waits", () => {
    const clock = detentionClock(
      { arrived_at: arrived, departed_at: null },
      terms,
      at("16:00")
    )
    assert.equal(clock.waiting, 3_600_000)
    assert.equal(clock.freeLeft, 3_600_000)
    assert.equal(clock.started, false)
    assert.equal(clock.soon, false)
    assert.equal(clock.amount, 0)
  })

  it("warns in the last half hour of free time", () => {
    const clock = detentionClock(
      { arrived_at: arrived, departed_at: null },
      terms,
      at("16:40")
    )
    assert.equal(clock.soon, true)
    assert.equal(clock.started, false)
  })

  it("runs detention in quarter hours, rounded up, once free time is out", () => {
    const clock = detentionClock(
      { arrived_at: arrived, departed_at: null },
      terms,
      at("17:20")
    )
    assert.equal(clock.started, true)
    assert.equal(clock.over, 20 * 60_000)
    assert.equal(clock.amount, 37.5)
  })

  it("stops once the driver leaves, and needs free time on the load", () => {
    assert.equal(
      detentionClock(
        { arrived_at: arrived, departed_at: "2026-12-03T18:00:00Z" },
        terms,
        at("19:00")
      ),
      null
    )
    assert.equal(
      detentionClock(
        { arrived_at: arrived, departed_at: null },
        { detention_free_hours: null, detention_rate: null },
        at("19:00")
      ),
      null
    )
  })

  it("has no amount without a rate", () => {
    const clock = detentionClock(
      { arrived_at: arrived, departed_at: null },
      { detention_free_hours: 2, detention_rate: null },
      at("18:00")
    )
    assert.equal(clock.started, true)
    assert.equal(clock.amount, null)
  })

  it("starts free time at the appointment for a driver who's early", () => {
    // In at 3:00, appointment at 6:00, 2 free hours: free until 8:00.
    const stop = {
      arrived_at: arrived,
      departed_at: null,
      appointment_at: "2026-12-03T18:00:00Z",
    }
    const waiting = detentionClock(stop, terms, at("17:10"))
    assert.equal(waiting.waiting, 130 * 60_000)
    assert.equal(waiting.started, false)
    assert.equal(waiting.freeUntil, at("20:00"))
    const late = detentionClock(stop, terms, at("20:20"))
    assert.equal(late.started, true)
    assert.equal(late.amount, 37.5)
  })

  it("starts free time at arrival for a driver who's late", () => {
    const clock = detentionClock(
      {
        arrived_at: arrived,
        departed_at: null,
        appointment_at: "2026-12-03T13:00:00Z",
      },
      terms,
      at("16:00")
    )
    assert.equal(clock.freeUntil, at("17:00"))
  })
})

describe("stopDetention", () => {
  it("bills from the appointment when the driver was early", () => {
    // In 3:00, appointment 6:00, out 9:10: 70 minutes past free time.
    const detention = stopDetention(
      {
        arrived_at: arrived,
        departed_at: "2026-12-03T21:10:00Z",
        appointment_at: "2026-12-03T18:00:00Z",
      },
      terms
    )
    assert.equal(detention.onSite, 370 * 60_000)
    assert.equal(detention.billableHours, 1.25)
    assert.equal(detention.amount, 93.75)
  })

  it("bills from arrival with no appointment moment", () => {
    const detention = stopDetention(
      { arrived_at: arrived, departed_at: "2026-12-03T18:10:00Z" },
      terms
    )
    assert.equal(detention.billableHours, 1.25)
  })
})
