import type { DriverStatus, PayType } from "@/lib/schemas/driver"
import type { LoadStatus } from "@/lib/schemas/load"

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

/** The pay rate locked onto a load when its driver was assigned. */
export type LockedPay = {
  driver_pay_type: PayType | null
  driver_pay_rate: number | null
}

/**
 * What the driver earns on a load, at the rate locked onto it when they were
 * assigned (not their rate today). Null when there's no rate, or a per-mile
 * rate on a load without miles.
 */
export function loadDriverPay(
  load: LockedPay & { rate: number; miles: number | null }
) {
  return driverPay(
    { pay_type: load.driver_pay_type, pay_rate: load.driver_pay_rate },
    load
  )
}

/** "today", "in 1 day", "in 9 days". */
export function inDays(days: number) {
  return days === 0 ? "today" : `in ${days} ${days === 1 ? "day" : "days"}`
}

/** The Monday of the week `date` ("YYYY-MM-DD") falls in. */
export function weekStart(date: string) {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  return day.toISOString().slice(0, 10)
}

/** A load as the driver page counts it. */
export type DriverPayLoad = LockedPay & {
  rate: number
  miles: number | null
  status: LoadStatus
  /** Wall-clock time at the last stop, "YYYY-MM-DDTHH:mm:ss". */
  delivery_start: string
}

/** Delivered (or further along): the driver has earned the pay. */
const EARNED: LoadStatus[] = ["delivered", "invoiced", "paid", "factored"]
/** Still on their schedule: the pay is coming. */
const AHEAD: LoadStatus[] = ["booked", "dispatched", "loaded"]

export type PayTotal = {
  loads: number
  pay: number
  revenue: number
  miles: number
  /** Loads whose pay can't be worked out: a per-mile rate and no miles. */
  unpriced: number
}

function total(loads: DriverPayLoad[]): PayTotal {
  let pay = 0
  let unpriced = 0
  for (const load of loads) {
    const amount = loadDriverPay(load)
    if (amount === null) unpriced++
    else pay += amount
  }
  return {
    loads: loads.length,
    pay,
    revenue: loads.reduce((sum, load) => sum + Number(load.rate), 0),
    miles: loads.reduce((sum, load) => sum + (load.miles ?? 0), 0),
    unpriced,
  }
}

/**
 * What a driver has earned this week (from Monday), this month, this year
 * and in all, by delivery date at the rate locked on each load, and what's
 * booked ahead. Cancelled and TONU loads weren't driven, so they don't count.
 */
export function driverEarnings(loads: DriverPayLoad[], today: string) {
  const earned = loads.filter((load) => EARNED.includes(load.status))
  const since = (start: string) =>
    total(earned.filter((load) => load.delivery_start.slice(0, 10) >= start))
  return {
    week: since(weekStart(today)),
    month: since(`${today.slice(0, 7)}-01`),
    year: since(`${today.slice(0, 4)}-01-01`),
    all: total(earned),
    ahead: total(loads.filter((load) => AHEAD.includes(load.status))),
  }
}

/** A load as the next step reads it. */
export type DriverStepLoad = {
  id: string
  reference: string
  status: LoadStatus
  pickup_location: string
  delivery_location: string
  /** Wall-clock times, "YYYY-MM-DDTHH:mm:ss". */
  pickup_start: string
  delivery_start: string
}

export type DriverStep = {
  /** How loud the step is: a lapsed document is "danger". */
  tone: "danger" | "warning" | "default"
  title: string
  detail: string
  action:
    | { type: "edit"; label: string }
    | { type: "activate" }
    | { type: "load"; id: string; reference: string }
    | { type: "new_load" }
    | null
}

const firstName = (name: string) => name.split(" ")[0]
const day = (wallClock: string) => formatDate(wallClock.slice(0, 10))

/**
 * The one thing to do about a driver now, most pressing first: a lapsed
 * document keeps them off the road, then the load they're on, a document
 * running out within 30 days, missing dates, and their next load.
 */
export function driverNextStep(
  driver: { full_name: string; status: DriverStatus },
  items: ComplianceItem[],
  loads: DriverStepLoad[]
): DriverStep {
  const name = firstName(driver.full_name)
  if (driver.status === "inactive") {
    return {
      tone: "default",
      title: "Inactive",
      detail: `${name} stays on record but can't be picked for new loads. Mark them active to book them again.`,
      action: { type: "activate" },
    }
  }

  const lapsed = items.filter((item) => item.expiry.state === "expired")
  if (lapsed[0]) {
    const item = lapsed[0]
    const more = lapsed.length - 1
    return {
      tone: "danger",
      title: `${item.label} ${item.kind === "expires" ? "expired" : "overdue"}`,
      detail: `${item.kind === "expires" ? "Expired" : "Was due"} ${formatDate(item.due!)}. Keep ${name} off loads until it's renewed, then save the new date.${more ? ` ${more} more ${more === 1 ? "item is" : "items are"} late.` : ""}`,
      action: { type: "edit", label: "Update dates" },
    }
  }

  const byPickup = [...loads].sort((a, b) =>
    a.pickup_start.localeCompare(b.pickup_start)
  )
  const onLoad = byPickup.find(
    (load) => load.status === "dispatched" || load.status === "loaded"
  )
  if (onLoad) {
    return {
      tone: "default",
      title: `On load ${onLoad.reference}`,
      detail:
        onLoad.status === "loaded"
          ? `In transit to ${onLoad.delivery_location}, delivering ${day(onLoad.delivery_start)}.`
          : `Dispatched. Picks up ${day(onLoad.pickup_start)} in ${onLoad.pickup_location}.`,
      action: { type: "load", id: onLoad.id, reference: onLoad.reference },
    }
  }

  const soon = items.find(
    (item) => item.expiry.state === "urgent" || item.expiry.state === "soon"
  )
  if (soon && soon.expiry.state !== "missing") {
    return {
      tone: "warning",
      title: `${soon.label} ${soon.kind === "expires" ? "expires" : "due"} ${inDays(soon.expiry.days)}`,
      detail: `${soon.kind === "expires" ? "Runs out" : "Due"} ${formatDate(soon.due!)}. Renew it before then and save the new date.`,
      action: { type: "edit", label: "Update dates" },
    }
  }

  const unset = items.filter(
    (item) => item.kind === "expires" && item.expiry.state === "missing"
  )
  if (unset.length) {
    return {
      tone: "warning",
      title: `Add the ${unset.map((item) => item.label).join(" and ")} ${unset.length === 1 ? "date" : "dates"}`,
      detail: "You'll get a warning 60, 30 and 7 days before it runs out.",
      action: { type: "edit", label: "Add dates" },
    }
  }

  const next = byPickup.find((load) => load.status === "booked")
  if (next) {
    return {
      tone: "default",
      title: `Next up: load ${next.reference}`,
      detail: `Picks up ${day(next.pickup_start)} in ${next.pickup_location}.`,
      action: { type: "load", id: next.id, reference: next.reference },
    }
  }

  return {
    tone: "default",
    title: "Ready for a load",
    detail: `Nothing booked for ${name}. Pick them on a new load to send them out.`,
    action: { type: "new_load" },
  }
}
