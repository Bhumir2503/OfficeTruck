import type { LoadStatus } from "@/lib/schemas/load"

/*
 * Weekly driver pay. A week runs Monday to Sunday and a load belongs to the
 * week it was delivered in. Net pay = the driver's pay on each load (at the
 * rate locked on the load) + what they spent out of pocket on those loads +
 * adjustments (positive adds, negative takes off).
 */

/** Delivered or further along: the driver has earned the pay. */
export const PAYABLE_STATUSES: LoadStatus[] = [
  "delivered",
  "invoiced",
  "paid",
  "factored",
  // Only when the driver gets TONU pay; on its pickup day.
  "tonu",
]

const DAY = 86_400_000
const toDate = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`)
const toDay = (date: Date) => date.toISOString().slice(0, 10)

/** The Monday of the week `day` ("YYYY-MM-DD") falls in. */
export function weekOf(day: string) {
  const date = toDate(day)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return toDay(date)
}

/** The Monday `weeks` weeks after (or before, when negative) `week`. */
export function shiftWeek(week: string, weeks: number) {
  return toDay(new Date(toDate(week).getTime() + weeks * 7 * DAY))
}

/** The days a week covers, as [Monday, next Monday). */
export function weekRange(week: string) {
  return { from: week, to: shiftWeek(week, 1) }
}

/** A "YYYY-MM-DD" that is a Monday, or null. */
export function parseWeek(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }
  const date = toDate(value)
  if (Number.isNaN(date.getTime()) || toDay(date) !== value) return null
  return weekOf(value) === value ? value : null
}

const short = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})
const withYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

/** "Nov 16 – 22, 2026", or across months "Nov 30 – Dec 6, 2026". */
export function formatWeek(week: string) {
  return formatPeriod(week, shiftDays(week, 6))
}

const shiftDays = (day: string, days: number) =>
  toDay(new Date(toDate(day).getTime() + days * DAY))

// ------------------------------------------------------------ Pay periods --

/** How often a driver is paid. */
export const PAY_PERIODS = ["week", "two_weeks", "month"] as const
export type PayPeriod = (typeof PAY_PERIODS)[number]

export const PAY_PERIOD_LABELS: Record<PayPeriod, string> = {
  week: "Week",
  two_weeks: "2 weeks",
  month: "Month",
}

/**
 * Two-week periods are counted in pairs of weeks from this Monday, so a
 * driver's blocks stay the same whatever week they're looked at from.
 */
const TWO_WEEK_EPOCH = "2024-01-01"

/**
 * The first day of the pay period `day` falls in: its Monday for a week,
 * the Monday starting its pair of weeks for 2 weeks, the 1st for a month.
 */
export function periodOf(day: string, period: PayPeriod) {
  if (period === "month") return `${day.slice(0, 7)}-01`
  const monday = weekOf(day)
  if (period === "week") return monday
  const weeks = Math.round(
    (toDate(monday).getTime() - toDate(TWO_WEEK_EPOCH).getTime()) / (7 * DAY)
  )
  return shiftWeek(monday, -(((weeks % 2) + 2) % 2))
}

/** The period `count` periods after (or before, when negative) `start`. */
export function shiftPeriod(start: string, period: PayPeriod, count: number) {
  if (period === "week") return shiftWeek(start, count)
  if (period === "two_weeks") return shiftWeek(start, count * 2)
  const date = toDate(start)
  date.setUTCMonth(date.getUTCMonth() + count, 1)
  return toDay(date)
}

/** A period's last day. */
export function periodEnd(start: string, period: PayPeriod) {
  return shiftDays(shiftPeriod(start, period, 1), -1)
}

/** The days a period covers, as [first day, first day of the next). */
export function periodRange(start: string, period: PayPeriod) {
  return { from: start, to: shiftPeriod(start, period, 1) }
}

/** A "YYYY-MM-DD" that starts a `period`, or null. */
export function parsePeriod(value: unknown, period: PayPeriod) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }
  const date = toDate(value)
  if (Number.isNaN(date.getTime()) || toDay(date) !== value) return null
  return periodOf(value, period) === value ? value : null
}

/**
 * "Nov 16 – 22, 2026", across months "Nov 30 – Dec 6, 2026", or across
 * years "Dec 28, 2026 – Jan 10, 2027". `last` is the period's last day.
 */
export function formatPeriod(first: string, last: string) {
  const start = toDate(first)
  const end = toDate(last)
  const sameMonth = start.getUTCMonth() === end.getUTCMonth()
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear()
  const from = sameYear ? short.format(start) : withYear.format(start)
  const to = sameMonth ? String(end.getUTCDate()) : withYear.format(end)
  return `${from} – ${sameMonth ? `${to}, ${end.getUTCFullYear()}` : to}`
}

export type SettlementLoad = {
  id: string
  reference: string
  /** Wall-clock time, "YYYY-MM-DDTHH:mm:ss". */
  delivery_start: string
  /**
   * The day it was really delivered, "YYYY-MM-DD". Missing from lines
   * frozen on statements paid before it was kept.
   */
  delivered_on?: string | null
  rate: number
  miles: number | null
  /** A TONU: paid for the wasted trip, no miles run. */
  tonu?: boolean
  /** The driver's pay on the load, or null when it can't be worked out. */
  pay: number | null
  /** "Dallas, TX → Atlanta, GA" */
  route: string
}

export type SettlementExpense = {
  id: string
  load_id: string
  kind: string
  amount: number
  spent_on: string
  note: string | null
}

export type SettlementAdjustment = {
  id: string
  description: string
  /** Positive adds to pay, negative takes off. */
  amount: number
}

export type SettlementTotals = {
  loads: number
  miles: number
  gross: number
  reimbursements: number
  adjustments: number
  net: number
  /** Loads whose pay couldn't be worked out (per-mile pay, no miles). */
  unpriced: number
}

const cents = (value: number) => Math.round(value * 100) / 100

export function settlementTotals(
  loads: Pick<SettlementLoad, "pay" | "miles">[],
  expenses: Pick<SettlementExpense, "amount">[],
  adjustments: Pick<SettlementAdjustment, "amount">[]
): SettlementTotals {
  let gross = 0
  let unpriced = 0
  let miles = 0
  for (const load of loads) {
    if (load.pay === null) unpriced++
    else gross += load.pay
    miles += load.miles ?? 0
  }
  const reimbursements = expenses.reduce((sum, e) => sum + e.amount, 0)
  const adjusted = adjustments.reduce((sum, a) => sum + a.amount, 0)
  return {
    loads: loads.length,
    miles,
    gross: cents(gross),
    reimbursements: cents(reimbursements),
    adjustments: cents(adjusted),
    net: cents(gross + reimbursements + adjusted),
    unpriced,
  }
}

/**
 * An adjustment as typed: "-150", "−150.00", "$150" with a "take off"
 * choice. Returns the signed amount, or an error message.
 */
export function parseAdjustment(
  amount: string,
  direction: "add" | "deduct"
): { amount: number } | { error: string } {
  const cleaned = amount.replace(/[$,\s]/g, "").replace(/^[-−]/, "")
  if (!/^\d{1,8}(\.\d{0,2})?$/.test(cleaned)) {
    return { error: "Enter an amount like 150.00." }
  }
  const value = Number(cleaned)
  if (value <= 0) return { error: "Must be more than $0." }
  return { amount: direction === "deduct" ? -value : value }
}
