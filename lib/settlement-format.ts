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
  const start = toDate(week)
  const end = new Date(start.getTime() + 6 * DAY)
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
  rate: number
  miles: number | null
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
