import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { describe, it } from "node:test"

import {
  decryptField,
  encryptField,
  keyringFromEnv,
  maskSsn,
  normalizeSsn,
  sealDateOfBirth,
  sealSsn,
} from "../lib/dq-crypto.ts"

const key = () => randomBytes(32).toString("base64")
const DRIVER = "3c7c0acc-8af7-418d-9f39-c20b1713e6d0"
const OTHER_DRIVER = "b0f7d86c-795c-4e09-b5c0-7f8236a2a411"
// The column check in the dq_employment_applications migration.
const STORED_FORMAT =
  /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

const ring = keyringFromEnv({
  DQ_FIELD_KEYS: `k1:${key()}`,
  DQ_FIELD_KEY_ID: "k1",
})

describe("encryptField", () => {
  it("round-trips, in the format the database accepts", () => {
    const stored = encryptField(
      "123456789",
      { driverId: DRIVER, field: "ssn" },
      ring
    )
    assert.match(stored, STORED_FORMAT)
    assert.equal(
      decryptField(stored, { driverId: DRIVER, field: "ssn" }, ring),
      "123456789"
    )
  })

  it("never contains the plaintext, and differs every time", () => {
    const context = { driverId: DRIVER, field: "ssn" }
    const a = encryptField("123456789", context, ring)
    const b = encryptField("123456789", context, ring)
    assert.notEqual(a, b)
    assert.ok(!a.includes("123456789"))
    assert.ok(!a.includes(Buffer.from("123456789").toString("base64url")))
  })

  it("won't decrypt when moved to another driver or field", () => {
    const stored = encryptField(
      "123456789",
      { driverId: DRIVER, field: "ssn" },
      ring
    )
    assert.throws(() =>
      decryptField(stored, { driverId: OTHER_DRIVER, field: "ssn" }, ring)
    )
    assert.throws(() =>
      decryptField(stored, { driverId: DRIVER, field: "date_of_birth" }, ring)
    )
  })

  it("won't decrypt a tampered value", () => {
    const context = { driverId: DRIVER, field: "ssn" }
    const parts = encryptField("123456789", context, ring).split(".")
    const body = Buffer.from(parts[4], "base64url")
    body[0] ^= 1
    parts[4] = body.toString("base64url")
    assert.throws(() => decryptField(parts.join("."), context, ring))
  })

  it("decrypts old values after the key is rotated", () => {
    const oldKey = key()
    const before = keyringFromEnv({
      DQ_FIELD_KEYS: `k1:${oldKey}`,
      DQ_FIELD_KEY_ID: "k1",
    })
    const after = keyringFromEnv({
      DQ_FIELD_KEYS: `k1:${oldKey},k2:${key()}`,
      DQ_FIELD_KEY_ID: "k2",
    })
    const context = { driverId: DRIVER, field: "date_of_birth" }
    const stored = encryptField("1980-02-29", context, before)
    assert.equal(decryptField(stored, context, after), "1980-02-29")
    assert.ok(encryptField("1980-02-29", context, after).startsWith("v1.k2."))
  })

  it("fails without the key", () => {
    const stored = encryptField(
      "123456789",
      { driverId: DRIVER, field: "ssn" },
      ring
    )
    const other = keyringFromEnv({
      DQ_FIELD_KEYS: `k9:${key()}`,
      DQ_FIELD_KEY_ID: "k9",
    })
    assert.throws(
      () => decryptField(stored, { driverId: DRIVER, field: "ssn" }, other),
      /isn't configured/
    )
  })
})

describe("keyringFromEnv", () => {
  it("refuses missing, short or unnamed keys", () => {
    assert.throws(() => keyringFromEnv({}))
    assert.throws(() =>
      keyringFromEnv({
        DQ_FIELD_KEYS: `k1:${randomBytes(16).toString("base64")}`,
        DQ_FIELD_KEY_ID: "k1",
      })
    )
    assert.throws(() =>
      keyringFromEnv({ DQ_FIELD_KEYS: `k1:${key()}`, DQ_FIELD_KEY_ID: "k2" })
    )
    assert.throws(() =>
      keyringFromEnv({ DQ_FIELD_KEYS: `:${key()}`, DQ_FIELD_KEY_ID: "" })
    )
  })
})

describe("SSN", () => {
  it("accepts dashes or not, and refuses impossible numbers", () => {
    assert.equal(normalizeSsn("123-45-6789"), "123456789")
    assert.equal(normalizeSsn(" 123 45 6789 "), "123456789")
    for (const bad of [
      "000-12-3456",
      "666-12-3456",
      "900-12-3456",
      "123-00-4567",
      "123-45-0000",
      "12345678",
      "abc-de-fghi",
    ]) {
      assert.equal(normalizeSsn(bad), null, bad)
    }
  })

  it("keeps only the last 4 readable", () => {
    const sealed = sealSsn("123-45-6789", DRIVER, ring)
    assert.ok(sealed)
    assert.equal(sealed.last4, "6789")
    assert.equal(maskSsn(sealed.last4), "•••-••-6789")
    assert.ok(!sealed.ciphertext.includes("12345"))
    assert.equal(sealSsn("000-00-0000", DRIVER, ring), null)
  })
})

describe("sealDateOfBirth", () => {
  it("encrypts real dates only", () => {
    assert.match(
      sealDateOfBirth("1980-02-29", DRIVER, ring) ?? "",
      STORED_FORMAT
    )
    assert.equal(sealDateOfBirth("1981-02-29", DRIVER, ring), null)
    assert.equal(sealDateOfBirth("02/03/1980", DRIVER, ring), null)
  })
})
