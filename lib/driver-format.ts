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
/** Where the driver page's CDL card is, for links that jump to it. */
export const DRIVER_CDL_ID = "cdl-details"

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

/** One of a driver's qualification file dates, as the side panel shows it. */
export type DqDate = {
  /** When it's due, or when the completed one runs out. */
  due: string | null
  /** When it was last done. */
  last: string | null
  /** The current one is done (so its date is an expiry, not a due date). */
  done: boolean
}

/**
 * The qualification file dates the driver page and lists show beside the
 * CDL: medical proof, the annual review and the Clearinghouse query. Null
 * when the file has no such item (it isn't set up yet).
 */
export type DqComplianceDates = {
  medical: DqDate | null
  annualReview: DqDate | null
  clearinghouse: DqDate | null
}

type DqDateItem = {
  template_code: string
  cycle_number: number
  completed_at: string | null
  valid_until: string | null
  due_date: string | null
  not_applicable_reason: string | null
}

/** Picks those dates out of a driver's qualification file items. */
export function dqComplianceDates(
  items: readonly DqDateItem[]
): DqComplianceDates {
  const pick = (codes: string[]): DqDate | null => {
    const mine = items.filter(
      (item) =>
        codes.includes(item.template_code) && !item.not_applicable_reason
    )
    if (!mine.length) return null
    const current = mine.reduce((a, b) =>
      b.cycle_number > a.cycle_number ? b : a
    )
    const last = mine
      .filter((item) => item.completed_at)
      .map((item) => item.completed_at!.slice(0, 10))
      .sort()
      .at(-1)
    return {
      due: current.completed_at ? current.valid_until : current.due_date,
      last: last ?? null,
      done: !!current.completed_at,
    }
  }
  return {
    medical: pick(["medical_proof_cdl", "medical_certificate"]),
    annualReview: pick(["annual_review"]),
    clearinghouse: pick(["clearinghouse_limited_query"]),
  }
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

/**
 * The four dates to keep up with, in the order they're shown: the CDL from
 * the driver, the rest from their qualification file (`dq`, or undefined
 * when it isn't set up, which shows them as not set).
 */
export function complianceItems(
  driver: {
    cdl_expires_on: string | null
    medical_card_expires_on?: string | null
    last_annual_review_on?: string | null
    last_clearinghouse_query_on?: string | null
  },
  dq: DqComplianceDates | undefined,
  today: string
): ComplianceItem[] {
  const fromFile = (
    key: string,
    label: string,
    date: DqDate | null | undefined,
    kind: "expires" | "due"
  ): ComplianceItem => ({
    key,
    label,
    // An item not done yet is due, even if it runs out once it's done.
    kind: date && !date.done ? "due" : kind,
    due: date?.due ?? null,
    last: date?.last ?? null,
    expiry: expiry(date?.due ?? null, today),
  })
  const yearly = (
    key: string,
    label: string,
    last: string | null | undefined
  ): ComplianceItem | null => {
    if (!last) return null
    const due = addYear(last)
    return { key, label, kind: "due", due, last, expiry: expiry(due, today) }
  }
  return [
    {
      key: "cdl",
      label: "CDL",
      kind: "expires",
      due: driver.cdl_expires_on,
      expiry: expiry(driver.cdl_expires_on, today),
    },
    // The medical card's date from its card, else the qualification file.
    driver.medical_card_expires_on
      ? {
          key: "medical_card",
          label: "Medical card",
          kind: "expires" as const,
          due: driver.medical_card_expires_on,
          expiry: expiry(driver.medical_card_expires_on, today),
        }
      : fromFile("medical_card", "Medical card", dq?.medical, "expires"),
    // The yearly checks from the driver, else the qualification file.
    yearly("annual_review", "Annual review", driver.last_annual_review_on) ??
      fromFile("annual_review", "Annual review", dq?.annualReview, "due"),
    yearly(
      "clearinghouse",
      "Clearinghouse query",
      driver.last_clearinghouse_query_on
    ) ??
      fromFile(
        "clearinghouse",
        "Clearinghouse query",
        dq?.clearinghouse,
        "due"
      ),
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
  /** Stable, so a list of steps can be keyed. */
  id: string
  /** How loud the step is: a lapsed document is "danger". */
  tone: "danger" | "warning" | "default"
  title: string
  detail: string
  action:
    /** Where to fix it on the driver page. */
    | { type: "edit"; label: string; target: DriverCardTarget }
    | { type: "activate" }
    | { type: "load"; id: string; reference: string }
    | { type: "new_load" }
    | null
}

/** The driver page cards a step can send you to. */
export type DriverCardTarget = "details" | "cdl" | "medical" | "annual"

/** The driver page's card ids, for links that jump to them. */
export const DRIVER_CARD_IDS: Record<DriverCardTarget, string> = {
  details: "driver-details",
  cdl: DRIVER_CDL_ID,
  medical: "medical-card",
  annual: "annual-checks",
}

/** What the next steps know about the driver beyond their dates. */
export type DriverStepFacts = {
  full_name: string
  status: DriverStatus
  phone?: string | null
  start_date?: string | null
  cdl_number?: string | null
  cdl_state?: string | null
  cdl_class?: string | null
  /** Kinds of document on file, e.g. "cdl", "medical_card". */
  documents?: readonly string[]
}

const firstName = (name: string) => name.split(" ")[0]
const day = (wallClock: string) => formatDate(wallClock.slice(0, 10))

/** Where an item is fixed: each has a card on the driver page. */
const TARGETS: Record<string, DriverCardTarget> = {
  cdl: "cdl",
  medical_card: "medical",
  annual_review: "annual",
  clearinghouse: "annual",
}
const targetOf = (item: ComplianceItem): DriverCardTarget | null =>
  TARGETS[item.key] ?? null

const fixAction = (
  item: ComplianceItem,
  label: string
): DriverStep["action"] => {
  const target = targetOf(item)
  return target ? { type: "edit", label, target } : null
}

const howToFix = (item: ComplianceItem) =>
  !targetOf(item)
    ? "record it in the qualification file"
    : item.kind === "due"
      ? "save the date you did it"
      : "save the new date"

/**
 * Everything to do about a driver, most pressing first: a lapsed document
 * keeps them off the road, then the load they're on, anything running out
 * within 30 days, what's missing from their profile, what's due within 60
 * days, and their next load. The first is what to do now; the rest is what
 * comes after. Never empty.
 */
export function driverNextSteps(
  driver: DriverStepFacts,
  items: ComplianceItem[],
  loads: DriverStepLoad[]
): DriverStep[] {
  const name = firstName(driver.full_name)
  if (driver.status === "inactive") {
    return [
      {
        id: "inactive",
        tone: "default",
        title: "Inactive",
        detail: `${name} stays on record but can't be picked for new loads. Mark them active to book them again.`,
        action: { type: "activate" },
      },
    ]
  }

  const steps: DriverStep[] = []

  // 1. Late: keeps them off the road.
  for (const item of items.filter((i) => i.expiry.state === "expired")) {
    steps.push({
      id: `late:${item.key}`,
      tone: "danger",
      title: `${item.label} ${item.kind === "expires" ? "expired" : "overdue"}`,
      detail: `${item.kind === "expires" ? "Expired" : "Was due"} ${formatDate(item.due!)}. Keep ${name} off loads until it's ${item.kind === "expires" ? "renewed" : "done"}, then ${howToFix(item)}.`,
      action: fixAction(item, `Update the ${item.label.toLowerCase()}`),
    })
  }

  // 2. The load they're on.
  const byPickup = [...loads].sort((a, b) =>
    a.pickup_start.localeCompare(b.pickup_start)
  )
  const onLoad = byPickup.find(
    (load) => load.status === "dispatched" || load.status === "loaded"
  )
  if (onLoad) {
    steps.push({
      id: `on:${onLoad.id}`,
      tone: "default",
      title: `On load ${onLoad.reference}`,
      detail:
        onLoad.status === "loaded"
          ? `In transit to ${onLoad.delivery_location}, delivering ${day(onLoad.delivery_start)}.`
          : `Dispatched. Picks up ${day(onLoad.pickup_start)} in ${onLoad.pickup_location}.`,
      action: { type: "load", id: onLoad.id, reference: onLoad.reference },
    })
  }

  // 3. Running out within 30 days.
  for (const item of items.filter(
    (i) => i.expiry.state === "urgent" || i.expiry.state === "soon"
  )) {
    if (item.expiry.state === "missing") continue
    steps.push({
      id: `soon:${item.key}`,
      tone: "warning",
      title: `${item.label} ${item.kind === "expires" ? "expires" : "due"} ${inDays(item.expiry.days)}`,
      detail: `${item.kind === "expires" ? "Runs out" : "Due"} ${formatDate(item.due!)}. ${item.kind === "expires" ? "Renew it" : "Do it"} before then and ${howToFix(item)}.`,
      action: fixAction(item, `Update the ${item.label.toLowerCase()}`),
    })
  }

  // 4. Missing from their profile.
  const docs = driver.documents ?? []
  const missing: [string, string, string, DriverCardTarget][] = []
  if (!driver.phone)
    missing.push([
      "phone",
      "Add a sign-in number",
      `${name} signs in on their phone with it, to upload their own papers.`,
      "details",
    ])
  if (!driver.start_date)
    missing.push([
      "start",
      "Add the start date",
      "Their file's due dates count from their first day.",
      "details",
    ])
  if (!driver.cdl_number || !driver.cdl_state)
    missing.push([
      "cdl_number",
      "Add the CDL number and state",
      "As printed on the license.",
      "cdl",
    ])
  if (!driver.cdl_class)
    missing.push(["cdl_class", "Add the CDL class", "A, B or C.", "cdl"])
  for (const item of items.filter(
    (i) => i.expiry.state === "missing" && targetOf(i)
  )) {
    missing.push([
      `date:${item.key}`,
      `Add the ${item.label} date`,
      "You'll get a warning 60, 30 and 7 days before it runs out.",
      targetOf(item)!,
    ])
  }
  if (!docs.includes("cdl"))
    missing.push([
      "cdl_copy",
      "Upload a copy of the CDL",
      "A photo of the front, or a PDF.",
      "cdl",
    ])
  if (!docs.includes("medical_card"))
    missing.push([
      "medical_copy",
      "Upload the medical card",
      "A photo or PDF of the medical examiner's certificate.",
      "medical",
    ])
  for (const [key, title, detail, target] of missing) {
    steps.push({
      id: `missing:${key}`,
      tone: "warning",
      title,
      detail,
      action: { type: "edit", label: title, target },
    })
  }

  // 5. Due within 60 days.
  for (const item of items) {
    if (item.expiry.state !== "upcoming") continue
    steps.push({
      id: `upcoming:${item.key}`,
      tone: "default",
      title: `${item.label} ${item.kind === "expires" ? "expires" : "due"} ${inDays(item.expiry.days)}`,
      detail: `${item.kind === "expires" ? "Runs out" : "Due"} ${formatDate(item.due!)}.`,
      action: fixAction(item, `Update the ${item.label.toLowerCase()}`),
    })
  }

  // 6. Their next load, or a new one.
  const next = byPickup.find((load) => load.status === "booked")
  if (next) {
    steps.push({
      id: `next:${next.id}`,
      tone: "default",
      title: `Next up: load ${next.reference}`,
      detail: `Picks up ${day(next.pickup_start)} in ${next.pickup_location}.`,
      action: { type: "load", id: next.id, reference: next.reference },
    })
  } else if (!onLoad) {
    steps.push({
      id: "ready",
      tone: "default",
      title: "Ready for a load",
      detail: `Nothing booked for ${name}. Pick them on a new load to send them out.`,
      action: { type: "new_load" },
    })
  }

  return steps
}

/** The one thing to do about a driver now: the first of their next steps. */
export function driverNextStep(
  driver: DriverStepFacts,
  items: ComplianceItem[],
  loads: DriverStepLoad[]
): DriverStep {
  return driverNextSteps(driver, items, loads)[0]!
}
