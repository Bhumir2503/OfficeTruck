import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/*
 * Field-level encryption for the employment application's Social Security
 * number and date of birth. They're encrypted here, on the app server, before
 * they're saved, so the database, its logs and backups only ever hold
 * ciphertext. Only server code may import this: the keys must never reach the
 * browser, and a decrypted SSN must never be logged or sent to an AI model.
 *
 * AES-256-GCM. A value is stored as
 *   v1.<key id>.<iv>.<auth tag>.<ciphertext>   (each part base64url)
 * The key id lets keys be rotated: new values use the current key, and old
 * ones still decrypt while their key is kept in the ring.
 *
 * Each value is bound to its driver and field (the additional authenticated
 * data), so a ciphertext copied onto another driver or field fails to decrypt.
 *
 * Keys come from two environment variables:
 *   DQ_FIELD_KEYS    "<id>:<32 bytes, base64>", comma separated
 *   DQ_FIELD_KEY_ID  the id of the key to encrypt with
 */

const VERSION = "v1"
const IV_BYTES = 12
const KEY_BYTES = 32
const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/

export type FieldKeyring = {
  /** The id new values are encrypted with. */
  current: string
  keys: ReadonlyMap<string, Buffer>
}

export type EncryptedField = "ssn" | "date_of_birth"

/** Which driver and field a value belongs to. */
export type FieldContext = { driverId: string; field: EncryptedField }

const aad = ({ driverId, field }: FieldContext) =>
  Buffer.from(`officetruck:dq:${driverId}:${field}`, "utf8")

/** Builds a keyring from the two environment variables. Throws if unusable. */
export function keyringFromEnv(
  env: Record<string, string | undefined> = process.env
): FieldKeyring {
  const keys = new Map<string, Buffer>()
  for (const entry of (env.DQ_FIELD_KEYS ?? "").split(",")) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const split = trimmed.indexOf(":")
    const id = trimmed.slice(0, split)
    const key = Buffer.from(trimmed.slice(split + 1), "base64")
    if (split < 1 || !KEY_ID.test(id) || key.length !== KEY_BYTES) {
      throw new Error(
        "DQ_FIELD_KEYS must be <id>:<32-byte base64 key> pairs, comma separated."
      )
    }
    keys.set(id, key)
  }
  const current = env.DQ_FIELD_KEY_ID ?? ""
  if (!keys.has(current)) {
    throw new Error("DQ_FIELD_KEY_ID must name a key in DQ_FIELD_KEYS.")
  }
  return { current, keys }
}

export function encryptField(
  plaintext: string,
  context: FieldContext,
  keyring: FieldKeyring
): string {
  const key = keyring.keys.get(keyring.current)
  if (!key) {
    throw new Error("The current DQ field key is missing.")
  }
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(aad(context))
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  return [
    VERSION,
    keyring.current,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".")
}

/** Throws if the value was tampered with, moved, or its key is gone. */
export function decryptField(
  stored: string,
  context: FieldContext,
  keyring: FieldKeyring
): string {
  const parts = stored.split(".")
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new Error("Not an encrypted DQ field.")
  }
  const [, keyId, iv, tag, ciphertext] = parts as [
    string,
    string,
    string,
    string,
    string,
  ]
  const key = keyring.keys.get(keyId)
  if (!key) {
    throw new Error("The key for this DQ field isn't configured.")
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64url")
  )
  decipher.setAAD(aad(context))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

/**
 * "123-45-6789" or "123456789" → "123456789", or null if it can't be an SSN
 * (area 000, 666 or 900–999; group 00; serial 0000).
 */
export function normalizeSsn(value: string): string | null {
  const digits = value.replace(/[\s-]/g, "")
  if (!/^\d{9}$/.test(digits)) return null
  const area = digits.slice(0, 3)
  if (area === "000" || area === "666" || area >= "900") return null
  if (digits.slice(3, 5) === "00" || digits.slice(5) === "0000") return null
  return digits
}

/** The only part of an SSN the app ever shows: "•••-••-6789". */
export function maskSsn(last4: string): string {
  return `•••-••-${last4}`
}

/**
 * Encrypts an SSN for saving. Returns the ciphertext and the last 4 digits,
 * the only part kept readable.
 */
export function sealSsn(
  value: string,
  driverId: string,
  keyring: FieldKeyring
): { ciphertext: string; last4: string } | null {
  const ssn = normalizeSsn(value)
  if (!ssn) return null
  return {
    ciphertext: encryptField(ssn, { driverId, field: "ssn" }, keyring),
    last4: ssn.slice(5),
  }
}

/** Encrypts a "YYYY-MM-DD" date of birth, or null if it isn't a real date. */
export function sealDateOfBirth(
  value: string,
  driverId: string,
  keyring: FieldKeyring
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    return null
  return encryptField(value, { driverId, field: "date_of_birth" }, keyring)
}
