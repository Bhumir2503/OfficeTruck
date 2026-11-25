import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { loadDriverPaySchema } from "../lib/schemas/load.ts"

describe("loadDriverPaySchema", () => {
  it("reads a typed amount with commas", () => {
    const result = loadDriverPaySchema.parse({ pay_type: "flat", pay_rate: "1,250.50" })
    assert.deepEqual(result, { pay_type: "flat", pay_rate: 1250.5 })
  })

  it("needs a rate", () => {
    assert.equal(loadDriverPaySchema.safeParse({ pay_type: "flat", pay_rate: "" }).success, false)
  })

  it("keeps a percentage at 100 or less", () => {
    assert.equal(loadDriverPaySchema.safeParse({ pay_type: "percent", pay_rate: "101" }).success, false)
    assert.equal(loadDriverPaySchema.safeParse({ pay_type: "percent", pay_rate: "30" }).success, true)
  })

  it("needs a pay type", () => {
    assert.equal(loadDriverPaySchema.safeParse({ pay_type: "", pay_rate: "500" }).success, false)
  })
})
