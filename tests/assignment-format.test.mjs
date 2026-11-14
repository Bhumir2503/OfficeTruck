import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  offerResend,
  RESEND_AFTER_MS,
  saveLabel,
  willNotify,
} from "../lib/assignment-format.ts"

const sentAt = "2026-11-13T18:51:00.000Z"
const sent = new Date(sentAt).getTime()

describe("offerResend", () => {
  const base = { sentAt, seenAt: null, emailTo: "ana@x.com", emailFailed: false }

  it("hides Resend and Copy once the driver opened the link", () => {
    assert.equal(
      offerResend({ ...base, seenAt: "2026-11-13T19:02:00.000Z", now: sent + 3 * RESEND_AFTER_MS }),
      false
    )
  })

  it("hides them for the first 20 minutes while unopened", () => {
    assert.equal(offerResend({ ...base, now: sent + RESEND_AFTER_MS - 1 }), false)
  })

  it("shows them once 20 minutes pass unopened", () => {
    assert.equal(offerResend({ ...base, now: sent + RESEND_AFTER_MS }), true)
  })

  it("shows them right away when the email failed", () => {
    assert.equal(offerResend({ ...base, emailFailed: true, now: sent }), true)
  })

  it("shows them right away when the driver has no way to be reached", () => {
    assert.equal(offerResend({ ...base, emailTo: null, now: sent }), true)
  })
})

describe("willNotify", () => {
  const ana = "ana", bo = "bo", truck = "t1"

  it("notifies when a booked load gets a truck and driver", () => {
    assert.equal(willNotify({ status: "booked", savedDriverId: null, driverId: ana, truckId: truck }), true)
  })

  it("doesn't notify without a truck", () => {
    assert.equal(willNotify({ status: "booked", savedDriverId: null, driverId: ana, truckId: null }), false)
  })

  it("doesn't notify a dispatched load's same driver again", () => {
    assert.equal(willNotify({ status: "dispatched", savedDriverId: ana, driverId: ana, truckId: truck }), false)
  })

  it("notifies a new driver on a dispatched load", () => {
    assert.equal(willNotify({ status: "dispatched", savedDriverId: ana, driverId: bo, truckId: truck }), true)
  })

  it("doesn't notify when unassigning", () => {
    assert.equal(willNotify({ status: "dispatched", savedDriverId: ana, driverId: null, truckId: truck }), false)
  })

  it("doesn't notify once the load is in transit", () => {
    assert.equal(willNotify({ status: "loaded", savedDriverId: ana, driverId: ana, truckId: truck }), false)
  })
})

describe("saveLabel", () => {
  it("names the driver being notified", () => {
    assert.equal(saveLabel(true, "Ana Torres"), "Save and notify Ana")
  })
  it("is plain Save otherwise", () => {
    assert.equal(saveLabel(false, "Ana Torres"), "Save")
    assert.equal(saveLabel(true, null), "Save")
  })
})
