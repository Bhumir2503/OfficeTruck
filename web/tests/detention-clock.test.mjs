import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { detentionClock } from "../lib/load-format.ts"

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
})
