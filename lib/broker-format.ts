import type { FmcsaRecord } from "@/lib/fmcsa"

// Shared by server and client: no server-only imports here.

/** Authority granted this recently is "new": a common sign of a risky broker. */
export const NEW_AUTHORITY_DAYS = 180
/** A name, address, phone or authority change this recent is flagged. */
export const RECENT_CHANGE_DAYS = 90
/** FMCSA data older than this is re-checked when a new rate con comes in. */
export const RECHECK_AFTER_HOURS = 24

const DAY = 86_400_000

function daysSince(date: string, now = Date.now()) {
  return Math.floor((now - Date.parse(date)) / DAY)
}

export type FmcsaFlag = {
  key: string
  tone: "danger" | "warning"
  text: string
}

/** What to warn about in a broker's FMCSA record, worst first. */
export function fmcsaFlags(record: FmcsaRecord | null): FmcsaFlag[] {
  if (!record) {
    return []
  }
  const flags: FmcsaFlag[] = []
  if (record.allowed_to_operate === false) {
    flags.push({
      key: "not_allowed",
      tone: "danger",
      text: "Not allowed to operate",
    })
  }
  if (record.broker_authority_active === false) {
    flags.push({
      key: "authority_inactive",
      tone: "danger",
      text: "No active broker authority",
    })
  }
  if (record.bond_on_file === false) {
    flags.push({
      key: "no_bond",
      tone: "danger",
      text: "No broker bond on file",
    })
  }
  if (
    record.authority_granted_on &&
    daysSince(record.authority_granted_on) <= NEW_AUTHORITY_DAYS
  ) {
    flags.push({
      key: "new_authority",
      tone: "warning",
      text: `New authority (${daysSince(record.authority_granted_on)} days)`,
    })
  }
  const recent = (date: string | null) =>
    !!date && daysSince(date) <= RECENT_CHANGE_DAYS
  if (recent(record.authority_changed_on)) {
    flags.push({
      key: "authority_changed",
      tone: "warning",
      text: "Authority recently changed",
    })
  }
  if (recent(record.name_changed_on)) {
    flags.push({
      key: "name_changed",
      tone: "warning",
      text: "Name recently changed",
    })
  }
  if (recent(record.address_changed_on)) {
    flags.push({
      key: "address_changed",
      tone: "warning",
      text: "Address recently changed",
    })
  }
  if (recent(record.phone_changed_on)) {
    flags.push({
      key: "phone_changed",
      tone: "warning",
      text: "Phone recently changed",
    })
  }
  return flags
}

/** Whether a record is old enough to look up again. */
export function isStale(record: FmcsaRecord | null) {
  return (
    !record ||
    Date.now() - Date.parse(record.checked_at) > RECHECK_AFTER_HOURS * 3_600_000
  )
}

/** "dispatch@TQL.com" → "tql.com"; null if it isn't an email address. */
export function emailDomain(email: string) {
  const match = email
    .trim()
    .toLowerCase()
    .match(/^[^@\s]+@([^@\s]+\.[a-z]{2,})$/)
  return match ? match[1] : null
}

export type SenderCheck =
  | { state: "empty" }
  | { state: "invalid" }
  /** The broker has no known domains to compare against. */
  | { state: "unknown"; domain: string }
  | { state: "match"; domain: string }
  | { state: "mismatch"; domain: string }

/**
 * Compares a rate con sender's domain with the broker's known domains. A
 * subdomain of a known domain (loads.tql.com for tql.com) counts as a match;
 * a lookalike (tql-loads.com) doesn't.
 */
export function checkSender(
  email: string | null | undefined,
  domains: string[]
): SenderCheck {
  if (!email?.trim()) {
    return { state: "empty" }
  }
  const domain = emailDomain(email)
  if (!domain) {
    return { state: "invalid" }
  }
  if (domains.length === 0) {
    return { state: "unknown", domain }
  }
  const known = domains.some(
    (known) => domain === known || domain.endsWith(`.${known}`)
  )
  return { state: known ? "match" : "mismatch", domain }
}

/** "Net 30", with the quick-pay fee if there is one. */
export function formatTerms(days: number, quickPay: number | null) {
  const terms = days === 0 ? "Due on receipt" : `Net ${days}`
  return quickPay === null || quickPay === undefined
    ? terms
    : `${terms} · quick pay ${Number(quickPay)}%`
}

/** "123456" → "MC-123456" */
export function formatMc(mc: string | null) {
  return mc ? `MC-${mc}` : null
}
