import type { PayType } from "@/lib/schemas/driver"

// Compliance dates are calendar dates with no zone, so they're read and
// printed as UTC: the server render and the browser then agree on the text.
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

/** "2027-03-04" → "Mar 4, 2027" */
export function formatDate(value: string) {
  return dateFormat.format(new Date(`${value}T00:00:00Z`))
}

/** Today's calendar date, "YYYY-MM-DD", in the server's time zone. */
export function today() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** "2026-02-28" → "2027-02-28": when a yearly check done on `date` is due again. */
export function addYear(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  // Feb 29 rolls back to Feb 28 rather than over to March.
  const next = new Date(Date.UTC(year + 1, month - 1, day))
  if (next.getUTCMonth() !== month - 1) next.setUTCDate(0)
  return next.toISOString().slice(0, 10)
}

/**
 * How far ahead to warn, from furthest to nearest. These match the reminder
 * schedule: 60, 30 and 7 days before something is due.
 */
export const WARNING_DAYS = [60, 30, 7] as const

export type ExpiryState =
  | "missing"
  | "expired"
  /** Within 7 days. */
  | "urgent"
  /** Within 30 days. */
  | "soon"
  /** Within 60 days. */
  | "upcoming"
  | "ok"

export type Expiry =
  | { state: "missing" }
  | { state: Exclude<ExpiryState, "missing">; days: number }

/**
 * Where a due date stands against `today` (both "YYYY-MM-DD"). A date that is
 * today still counts as valid: it runs out at the end of the day. For
 * `expired`, `days` is how long ago.
 */
export function expiry(date: string | null, today: string): Expiry {
  if (!date) {
    return { state: "missing" }
  }
  const days = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000
  )
  if (days < 0) return { state: "expired", days: -days }
  if (days <= 7) return { state: "urgent", days }
  if (days <= 30) return { state: "soon", days }
  if (days <= 60) return { state: "upcoming", days }
  return { state: "ok", days }
}

/** True for anything that needs doing within the 60-day window, or is late. */
export function needsAction(state: ExpiryState) {
  return (
    state === "expired" ||
    state === "urgent" ||
    state === "soon" ||
    state === "upcoming"
  )
}

type ComplianceDates = {
  cdl_expires_on: string | null
  medical_card_expires_on: string | null
  annual_review_on: string | null
  clearinghouse_query_on: string | null
}

export type ComplianceItem = {
  /** Unique among one record's items, e.g. "cdl" or "annual_inspection". */
  key: string
  label: string
  /** "expires" for documents that run out, "due" for checks to redo. */
  kind: "expires" | "due"
  /** When it runs out or is due again, or null if nothing is on file. */
  due: string | null
  /** For the yearly checks: when it was last done. */
  last?: string | null
  expiry: Expiry
}

/** The four dates to keep up with, in the order they're shown. */
export function complianceItems(
  driver: ComplianceDates,
  today: string
): ComplianceItem[] {
  const reviewDue = driver.annual_review_on
    ? addYear(driver.annual_review_on)
    : null
  const queryDue = driver.clearinghouse_query_on
    ? addYear(driver.clearinghouse_query_on)
    : null
  return [
    {
      key: "cdl",
      label: "CDL",
      kind: "expires",
      due: driver.cdl_expires_on,
      expiry: expiry(driver.cdl_expires_on, today),
    },
    {
      key: "medical_card",
      label: "Medical card",
      kind: "expires",
      due: driver.medical_card_expires_on,
      expiry: expiry(driver.medical_card_expires_on, today),
    },
    {
      key: "annual_review",
      label: "Annual review",
      kind: "due",
      due: reviewDue,
      last: driver.annual_review_on,
      expiry: expiry(reviewDue, today),
    },
    {
      key: "clearinghouse",
      label: "Clearinghouse query",
      kind: "due",
      due: queryDue,
      last: driver.clearinghouse_query_on,
      expiry: expiry(queryDue, today),
    },
  ]
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})
/** Per-mile rates often go to a tenth of a cent: $0.625. */
const usdPerMile = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
})

/** "$0.65 / mile", "25% of the load", "$500.00 / load". */
export function formatPay(type: PayType | null, rate: number | null) {
  if (!type || rate === null) {
    return null
  }
  const value = Number(rate)
  switch (type) {
    case "per_mile":
      return `${usdPerMile.format(value)} / mile`
    case "percent":
      return `${value}% of the load`
    case "flat":
      return `${usd.format(value)} / load`
  }
}

/**
 * What a driver earns on a load at their current rate, or null when it can't
 * be worked out (no rate, or a per-mile rate on a load without miles).
 */
export function driverPay(
  pay: { pay_type: PayType | null; pay_rate: number | null },
  load: { rate: number; miles: number | null }
) {
  if (!pay.pay_type || pay.pay_rate === null) {
    return null
  }
  const rate = Number(pay.pay_rate)
  switch (pay.pay_type) {
    case "per_mile":
      return load.miles === null ? null : rate * load.miles
    case "percent":
      return (Number(load.rate) * rate) / 100
    case "flat":
      return rate
  }
}
