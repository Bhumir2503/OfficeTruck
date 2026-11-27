import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  describeDriver,
  pickupSlack,
  suggestAssignments,
} from "../lib/assignment-match.ts"

const truck = (overrides) => ({
  truckId: "t1",
  unit: "101",
  defaultDriverId: null,
  from: "Dallas, TX",
  afterLoad: null,
  freeAt: null,
  emptyMiles: 50,
  emptyHours: 1,
  busyWith: null,
  inTransitWith: null,
  problem: null,
  ...overrides,
})

const driver = (overrides) => ({
  driverId: "d1",
  name: "Ana Torres",
  busyWith: null,
  inTransitWith: null,
  lastLoad: null,
  lastTruckId: null,
  lastPlace: null,
  lastFreeAt: null,
  trips: {},
  problem: null,
  ...overrides,
})

const now = "2026-12-01T08:00"

describe("pickupSlack", () => {
  it("counts from when the truck is free, plus the drive", () => {
    const slack = pickupSlack(
      { freeAt: "2026-12-01T10:00", emptyHours: 3 },
      "2026-12-01T15:00",
      now
    )
    assert.equal(slack, 2)
  })

  it("starts from now when the truck is already free", () => {
    const slack = pickupSlack(
      { freeAt: null, emptyHours: 4 },
      "2026-12-01T10:00",
      now
    )
    assert.equal(slack, -2)
  })

  it("can't tell without a pickup time or a drive time", () => {
    assert.equal(pickupSlack({ freeAt: null, emptyHours: 1 }, null, now), null)
    assert.equal(
      pickupSlack({ freeAt: null, emptyHours: null }, "2026-12-02T10:00", now),
      null
    )
  })
})

describe("suggestAssignments", () => {
  const pickup = "2026-12-02T09:00"

  it("leaves out busy trucks and ranks nearer trucks first", () => {
    const result = suggestAssignments({
      trucks: [
        truck({ truckId: "far", unit: "FAR", emptyMiles: 300, emptyHours: 5 }),
        truck({ truckId: "near", unit: "NEAR", emptyMiles: 20 }),
        truck({ truckId: "busy", unit: "BUSY", busyWith: "L-9" }),
      ],
      drivers: [driver()],
      pickupStart: pickup,
      now,
    })
    assert.deepEqual(
      result.map((s) => s.truckId),
      ["near", "far"]
    )
    assert.equal(result[0].driverId, "d1")
    assert.equal(result[0].clean, true)
  })

  it("pairs a truck with its usual driver", () => {
    const [best] = suggestAssignments({
      trucks: [truck({ defaultDriverId: "bo" })],
      drivers: [driver(), driver({ driverId: "bo", name: "Bo Lee" })],
      pickupStart: pickup,
      now,
    })
    assert.equal(best.driverId, "bo")
    assert.ok(best.lines.some((line) => line.text === "Bo usually drives 101"))
  })

  it("skips drivers on another load at the same time", () => {
    const [best] = suggestAssignments({
      trucks: [truck({ defaultDriverId: "bo" })],
      drivers: [
        driver(),
        driver({ driverId: "bo", name: "Bo Lee", busyWith: "L-7" }),
      ],
      pickupStart: pickup,
      now,
    })
    assert.equal(best.driverId, "d1")
  })

  it("prefers a driver who's done loads on the truck over one stranded elsewhere", () => {
    const [best] = suggestAssignments({
      trucks: [truck()],
      drivers: [
        driver({
          lastLoad: "L-1",
          lastTruckId: "t9",
          lastPlace: "Memphis, TN",
        }),
        driver({ driverId: "cy", name: "Cy Park", trips: { t1: 3 } }),
      ],
      pickupStart: pickup,
      now,
    })
    assert.equal(best.driverId, "cy")
  })

  it("ranks a truck that would be late below one that's on time", () => {
    const result = suggestAssignments({
      trucks: [
        truck({
          truckId: "late",
          emptyMiles: 10,
          afterLoad: "L-2",
          freeAt: "2026-12-02T08:30",
          emptyHours: 2,
        }),
        truck({ truckId: "ok", emptyMiles: 200, emptyHours: 4 }),
      ],
      drivers: [driver()],
      pickupStart: pickup,
      now,
    })
    assert.deepEqual(
      result.map((s) => s.truckId),
      ["ok", "late"]
    )
    assert.equal(result[1].clean, false)
  })

  it("offers each truck a different driver while there are drivers to go round", () => {
    const result = suggestAssignments({
      trucks: [
        truck({ truckId: "a", unit: "A", emptyMiles: 10 }),
        truck({ truckId: "b", unit: "B", emptyMiles: 20 }),
        truck({ truckId: "c", unit: "C", emptyMiles: 30 }),
      ],
      drivers: [
        driver({ driverId: "d1", name: "Ana Torres" }),
        driver({ driverId: "d2", name: "Ben Ortiz" }),
      ],
      pickupStart: pickup,
      now,
    })
    assert.deepEqual(
      result.map((s) => s.truckId),
      ["a", "b", "c"]
    )
    // Two drivers for three trucks: the first two differ, the third repeats.
    assert.notEqual(result[0].driverId, result[1].driverId)
    assert.ok(result[2].driverId)
  })

  it("still offers a truck with no free driver, lower down", () => {
    const [only] = suggestAssignments({
      trucks: [truck()],
      drivers: [driver({ busyWith: "L-3" })],
      pickupStart: pickup,
      now,
    })
    assert.equal(only.driverId, null)
    assert.equal(only.clean, false)
  })
})

describe("the usual driver", () => {
  it("says why the truck's usual driver isn't offered", () => {
    const [best] = suggestAssignments({
      trucks: [truck({ defaultDriverId: "bo" })],
      drivers: [
        driver(),
        driver({ driverId: "bo", name: "Bo Lee", busyWith: "L-8" }),
      ],
      pickupStart: "2026-12-02T09:00",
      now,
    })
    assert.equal(best.driverId, "d1")
    assert.ok(
      best.lines.some(
        (line) => line.text === "Usual driver Bo Lee is on L-8 then"
      )
    )
  })
})

describe("describeDriver", () => {
  it("says when a driver is busy, or where they'll be free", () => {
    assert.deepEqual(describeDriver(driver({ busyWith: "L-4" })), {
      text: "On load L-4 at the same time",
      tone: "warn",
    })
    assert.equal(
      describeDriver(
        driver({
          lastLoad: "L-5",
          lastPlace: "Tulsa, OK",
          lastFreeAt: "2026-12-01T15:00",
        })
      ).text,
      "Free in Tulsa, OK Dec 1, 3:00 PM after L-5"
    )
    assert.equal(describeDriver(driver()), null)
  })
})
