import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { loadDriverPay } from "../lib/driver-format.ts"
import { loadDriverPaySchema } from "../lib/schemas/load.ts"

describe("loadDriverPaySchema", () => {
  it("reads a typed amount with commas", () => {
    const result = loadDriverPaySchema.parse({
      pay_type: "flat",
      pay_rate: "1,250.50",
    })
    assert.deepEqual(result, { pay_type: "flat", pay_rate: 1250.5 })
  })

  it("needs a rate", () => {
    assert.equal(
      loadDriverPaySchema.safeParse({ pay_type: "flat", pay_rate: "" }).success,
      false
    )
  })

  it("keeps a percentage at 100 or less", () => {
    assert.equal(
      loadDriverPaySchema.safeParse({ pay_type: "percent", pay_rate: "101" })
        .success,
      false
    )
    assert.equal(
      loadDriverPaySchema.safeParse({ pay_type: "percent", pay_rate: "30" })
        .success,
      true
    )
  })

  it("needs a pay type", () => {
    assert.equal(
      loadDriverPaySchema.safeParse({ pay_type: "", pay_rate: "500" }).success,
      false
    )
  })
})

describe("loadDriverPay", () => {
  const load = (overrides) => ({
    driver_pay_type: "per_mile",
    driver_pay_rate: 0.6,
    rate: 1300,
    miles: 300,
    ...overrides,
  })

  it("pays the locked rate on a load that ran", () => {
    assert.equal(loadDriverPay(load({ status: "delivered" })), 180)
  })

  it("pays nothing on a TONU, whatever the pay type", () => {
    assert.equal(loadDriverPay(load({ status: "tonu" })), 0)
    assert.equal(
      loadDriverPay(
        load({ status: "tonu", driver_pay_type: "flat", driver_pay_rate: 400 })
      ),
      0
    )
    assert.equal(
      loadDriverPay(
        load({
          status: "tonu",
          driver_pay_type: "percent",
          driver_pay_rate: 28,
        })
      ),
      0
    )
  })

  it("still has no pay without a rate", () => {
    assert.equal(
      loadDriverPay(
        load({ status: "tonu", driver_pay_type: null, driver_pay_rate: null })
      ),
      null
    )
  })
})
