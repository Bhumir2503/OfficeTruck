import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { saveLabel, willDispatch } from "../lib/assignment-format.ts"

describe("willDispatch", () => {
  const ana = "ana", bo = "bo", truck = "t1"

  it("dispatches when a booked load gets a truck and driver", () => {
    assert.equal(willDispatch({ status: "booked", savedDriverId: null, driverId: ana, truckId: truck }), true)
  })

  it("doesn't dispatch without a truck", () => {
    assert.equal(willDispatch({ status: "booked", savedDriverId: null, driverId: ana, truckId: null }), false)
  })

  it("doesn't dispatch a dispatched load's same driver again", () => {
    assert.equal(willDispatch({ status: "dispatched", savedDriverId: ana, driverId: ana, truckId: truck }), false)
  })

  it("dispatches to a new driver on a dispatched load", () => {
    assert.equal(willDispatch({ status: "dispatched", savedDriverId: ana, driverId: bo, truckId: truck }), true)
  })

  it("doesn't dispatch when unassigning", () => {
    assert.equal(willDispatch({ status: "dispatched", savedDriverId: ana, driverId: null, truckId: truck }), false)
  })

  it("doesn't dispatch once the load is in transit", () => {
    assert.equal(willDispatch({ status: "loaded", savedDriverId: ana, driverId: ana, truckId: truck }), false)
  })
})

describe("saveLabel", () => {
  it("says the save dispatches the load", () => {
    assert.equal(saveLabel(true), "Save and dispatch")
  })
  it("is plain Save otherwise", () => {
    assert.equal(saveLabel(false), "Save")
  })
})
