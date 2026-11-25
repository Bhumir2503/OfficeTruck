import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { odometerMiles, odometerStops } from "../lib/load-format.ts"

const stop = (position, kind, readings = {}) => ({
  position,
  kind,
  arrived_odometer: null,
  departed_odometer: null,
  ...readings,
})

describe("odometerStops", () => {
  it("asks at the first pickup and the last stop", () => {
    const stops = [
      stop(1, "pickup"),
      stop(2, "pickup"),
      stop(3, "delivery"),
      stop(4, "delivery"),
    ]
    assert.deepEqual(odometerStops(stops), { firstPickup: 1, lastStop: 4 })
  })

  it("finds the first pickup by position, not list order", () => {
    const stops = [stop(3, "delivery"), stop(2, "pickup"), stop(1, "pickup")]
    assert.deepEqual(odometerStops(stops), { firstPickup: 1, lastStop: 3 })
  })

  it("has nothing to ask on a load with no stops", () => {
    assert.deepEqual(odometerStops([]), { firstPickup: null, lastStop: null })
  })
})

describe("odometerMiles", () => {
  it("is the last stop's departure less the first pickup's arrival", () => {
    const stops = [
      stop(1, "pickup", { arrived_odometer: 412350 }),
      stop(2, "delivery"),
      stop(3, "delivery", { departed_odometer: 412982 }),
    ]
    assert.equal(odometerMiles(stops), 632)
  })

  it("waits for both readings", () => {
    assert.equal(
      odometerMiles([
        stop(1, "pickup", { arrived_odometer: 412350 }),
        stop(2, "delivery"),
      ]),
      null
    )
    assert.equal(
      odometerMiles([
        stop(1, "pickup"),
        stop(2, "delivery", { departed_odometer: 412982 }),
      ]),
      null
    )
  })

  it("ignores a reading at a middle stop", () => {
    const stops = [
      stop(1, "pickup", { arrived_odometer: 100 }),
      stop(2, "delivery", { departed_odometer: 150 }),
      stop(3, "delivery", { departed_odometer: 300 }),
    ]
    assert.equal(odometerMiles(stops), 200)
  })

  it("gives nothing for readings that go backwards", () => {
    const stops = [
      stop(1, "pickup", { arrived_odometer: 500 }),
      stop(2, "delivery", { departed_odometer: 400 }),
    ]
    assert.equal(odometerMiles(stops), null)
  })
})
