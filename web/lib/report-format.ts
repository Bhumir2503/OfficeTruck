import type { LoadStatus } from "@/lib/schemas/load"

/*
 * The numbers behind the Reports page. A load counts once it's delivered (or
 * further along), on its delivery date, the same way driver pay is earned.
 * Cancelled and TONU loads weren't driven, so they don't count. Costs here
 * are what each load cost to run: the driver's pay at the rate locked on the
 * load, plus its expenses. Fixed costs like insurance and truck payments
 * aren't tracked yet, so "profit" is profit before them.
 */

/** Delivered or further along: the load was driven and earns revenue. */
export const REPORTED_STATUSES: LoadStatus[] = [
  "delivered",
  "invoiced",
  "paid",
  "factored",
]

/** A load as the Reports page counts it. */
export type ReportLoad = {
  id: string
  reference: string
  status: LoadStatus
  /** The delivery date, "YYYY-MM-DD". */
  delivered_on: string
  rate: number
  /** Loaded miles, or null when unknown. */
  miles: number | null
  empty_miles: number | null
  /** The driver's pay on the load, or null when it can't be worked out. */
  driver_pay: number | null
  /** A pay rate is set but the pay can't be worked out (per mile, no miles). */
  pay_unknown: boolean
  /** The total of the load's expenses, whoever paid them. */
  expenses: number
  truck: { id: string | null; name: string } | null
  driver: { id: string | null; name: string } | null
  broker: { id: string | null; name: string }
  /** "Dallas, TX" or the whole location when it can't be shortened. */
  origin: string
  destination: string
}

export const PERIODS = [
  "this_month",
  "last_month",
  "this_quarter",
  "this_year",
  "last_12_months",
  "all",
] as const
export type Period = (typeof PERIODS)[number]

export const PERIOD_LABELS: Record<Period, string> = {
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  this_year: "This year",
  last_12_months: "Last 12 months",
  all: "All time",
}

const pad = (n: number) => String(n).padStart(2, "0")
const monthStart = (year: number, month: number) => {
  // month is 1-12 and may run outside it; normalize.
  const d = new Date(Date.UTC(year, month - 1, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`
}

/**
 * The delivery dates a period covers, as [from, to) "YYYY-MM-DD" strings;
 * null ends are open. `today` is "YYYY-MM-DD".
 */
export function periodRange(
  period: Period,
  today: string
): { from: string | null; to: string | null } {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  switch (period) {
    case "this_month":
      return { from: monthStart(year, month), to: monthStart(year, month + 1) }
    case "last_month":
      return { from: monthStart(year, month - 1), to: monthStart(year, month) }
    case "this_quarter": {
      const first = month - ((month - 1) % 3)
      return { from: monthStart(year, first), to: monthStart(year, first + 3) }
    }
    case "this_year":
      return { from: `${year}-01-01`, to: `${year + 1}-01-01` }
    case "last_12_months":
      return {
        from: monthStart(year, month - 11),
        to: monthStart(year, month + 1),
      }
    case "all":
      return { from: null, to: null }
  }
}

export function inPeriod(load: ReportLoad, period: Period, today: string) {
  const { from, to } = periodRange(period, today)
  return (
    (from === null || load.delivered_on >= from) &&
    (to === null || load.delivered_on < to)
  )
}

const STATE = /\b([A-Z]{2})\b/
/**
 * "1200 Main St, Dallas, TX 75201, USA" → "Dallas, TX". Falls back to the
 * whole location, trimmed, when there's no city and state to find.
 */
export function cityState(location: string) {
  const parts = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^(USA|US|United States)$/i.test(part))
  for (let i = parts.length - 1; i > 0; i--) {
    const match = parts[i].match(STATE)
    if (match && /^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/.test(parts[i])) {
      return `${parts[i - 1]}, ${match[1]}`
    }
  }
  return location.trim()
}

/** What a load cost to run: driver pay and expenses. */
export const loadCost = (load: ReportLoad) =>
  (load.driver_pay ?? 0) + load.expenses

export const loadProfit = (load: ReportLoad) => load.rate - loadCost(load)

export type ReportTotals = {
  loads: number
  revenue: number
  driverPay: number
  expenses: number
  cost: number
  profit: number
  /** Profit as a share of revenue, 0-1; null with no revenue. */
  margin: number | null
  loadedMiles: number
  emptyMiles: number
  /** Revenue per loaded mile; null with no miles. */
  ratePerMile: number | null
  /** Cost per mile driven, loaded and empty; null with no miles. */
  costPerMile: number | null
  /** Profit per mile driven; null with no miles. */
  profitPerMile: number | null
  /** Empty miles as a share of all miles, 0-1; null with no miles. */
  emptyShare: number | null
  /** Loads whose driver pay couldn't be worked out, so cost is understated. */
  payUnknown: number
  /** Loads with no loaded miles, left out of the per-mile figures' miles. */
  noMiles: number
}

export function totals(loads: ReportLoad[]): ReportTotals {
  let revenue = 0
  let driverPay = 0
  let expenses = 0
  let loadedMiles = 0
  let emptyMiles = 0
  let payUnknown = 0
  let noMiles = 0
  for (const load of loads) {
    revenue += load.rate
    driverPay += load.driver_pay ?? 0
    expenses += load.expenses
    loadedMiles += load.miles ?? 0
    emptyMiles += load.empty_miles ?? 0
    if (load.pay_unknown) payUnknown++
    if (!load.miles) noMiles++
  }
  const cost = driverPay + expenses
  const profit = revenue - cost
  const allMiles = loadedMiles + emptyMiles
  return {
    loads: loads.length,
    revenue,
    driverPay,
    expenses,
    cost,
    profit,
    margin: revenue ? profit / revenue : null,
    loadedMiles,
    emptyMiles,
    ratePerMile: loadedMiles ? revenue / loadedMiles : null,
    costPerMile: allMiles ? cost / allMiles : null,
    profitPerMile: allMiles ? profit / allMiles : null,
    emptyShare: allMiles ? emptyMiles / allMiles : null,
    payUnknown,
    noMiles,
  }
}

export const BREAKDOWNS = ["truck", "driver", "broker", "lane"] as const
export type Breakdown = (typeof BREAKDOWNS)[number]

export const BREAKDOWN_LABELS: Record<Breakdown, string> = {
  truck: "Truck",
  driver: "Driver",
  broker: "Customer",
  lane: "Lane",
}

export type BreakdownRow = ReportTotals & {
  key: string
  name: string
  /** The truck, driver or broker record to link to, when there is one. */
  id: string | null
}

const NONE = "\u0000none"

function groupOf(
  load: ReportLoad,
  by: Breakdown
): { key: string; name: string; id: string | null } {
  switch (by) {
    case "truck":
      return load.truck
        ? {
            key: load.truck.id ?? `name:${load.truck.name}`,
            name: load.truck.name,
            id: load.truck.id,
          }
        : { key: NONE, name: "No truck", id: null }
    case "driver":
      return load.driver
        ? {
            key: load.driver.id ?? `name:${load.driver.name}`,
            name: load.driver.name,
            id: load.driver.id,
          }
        : { key: NONE, name: "No driver", id: null }
    case "broker":
      return {
        key: load.broker.id ?? `name:${load.broker.name}`,
        name: load.broker.name,
        id: load.broker.id,
      }
    case "lane": {
      const name = `${load.origin} → ${load.destination}`
      return { key: name.toLowerCase(), name, id: null }
    }
  }
}

/** Totals per truck, driver, broker or lane, most profitable first. */
export function breakdown(loads: ReportLoad[], by: Breakdown): BreakdownRow[] {
  const groups = new Map<
    string,
    { name: string; id: string | null; loads: ReportLoad[] }
  >()
  for (const load of loads) {
    const { key, name, id } = groupOf(load, by)
    const group = groups.get(key)
    if (group) group.loads.push(load)
    else groups.set(key, { name, id, loads: [load] })
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      name: group.name,
      id: group.id,
      ...totals(group.loads),
    }))
    .sort((a, b) => b.profit - a.profit || a.name.localeCompare(b.name))
}

const monthLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
})
const monthYearLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

/** One week or month on the dashboard's charts. */
export type SeriesPoint = {
  /** The week's Monday or the month's first day, "YYYY-MM-DD". */
  start: string
  /** "Nov 16" for a week, "Nov" for a month. */
  label: string
  /** "Week of Nov 16", "Nov 2026" */
  fullLabel: string
  revenue: number
  driverPay: number
  expenses: number
  profit: number
  loads: number
}

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const dayLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})
const utc = (date: string) => new Date(`${date}T00:00:00Z`)

const emptyPoint = (start: string, label: string, fullLabel: string) => ({
  start,
  label,
  fullLabel,
  revenue: 0,
  driverPay: 0,
  expenses: 0,
  profit: 0,
  loads: 0,
})

function addLoad(point: SeriesPoint, load: ReportLoad) {
  point.revenue += load.rate
  point.driverPay += load.driver_pay ?? 0
  point.expenses += load.expenses
  point.profit += loadProfit(load)
  point.loads++
}

/**
 * The last `count` weeks (Monday to Sunday), oldest first; the last is the
 * week `today` falls in.
 */
export function weeklySeries(
  loads: ReportLoad[],
  today: string,
  count: number
): SeriesPoint[] {
  const weekday = (utc(today).getUTCDay() + 6) % 7
  const first = addDays(today, -weekday - 7 * (count - 1))
  const points = Array.from({ length: count }, (_, i) => {
    const start = addDays(first, 7 * i)
    const label = dayLabel.format(utc(start))
    return emptyPoint(start, label, `Week of ${label}`)
  })
  const firstMs = utc(first).getTime()
  for (const load of loads) {
    if (load.delivered_on < first || load.delivered_on > today) continue
    const days = (utc(load.delivered_on).getTime() - firstMs) / 864e5
    addLoad(points[Math.floor(days / 7)], load)
  }
  return points
}

/** The last `count` months, oldest first; the last is this month. */
export function monthlySeries(
  loads: ReportLoad[],
  today: string,
  count: number
): SeriesPoint[] {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const points = Array.from({ length: count }, (_, i) => {
    const start = monthStart(year, month - (count - 1 - i))
    return emptyPoint(
      start,
      monthLabel.format(utc(start)),
      monthYearLabel.format(utc(start))
    )
  })
  const byMonth = new Map(points.map((p) => [p.start.slice(0, 7), p]))
  for (const load of loads) {
    if (load.delivered_on > today) continue
    const point = byMonth.get(load.delivered_on.slice(0, 7))
    if (point) addLoad(point, load)
  }
  return points
}

export const OVERVIEW_PERIODS = ["30days", "3months", "1year"] as const
export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number]
export const OVERVIEW_PERIOD_LABELS: Record<OverviewPeriod, string> = {
  "30days": "30 Days",
  "3months": "3 Months",
  "1year": "1 Year",
}

type SeriesTotals = Pick<
  SeriesPoint,
  "revenue" | "driverPay" | "expenses" | "profit" | "loads"
>
const sumPoints = (points: SeriesPoint[]): SeriesTotals =>
  points.reduce(
    (total, p) => ({
      revenue: total.revenue + p.revenue,
      driverPay: total.driverPay + p.driverPay,
      expenses: total.expenses + p.expenses,
      profit: total.profit + p.profit,
      loads: total.loads + p.loads,
    }),
    { revenue: 0, driverPay: 0, expenses: 0, profit: 0, loads: 0 }
  )

/**
 * The charts for a period: 5 weeks, 13 weeks or 12 months, with the totals
 * for it and for the same stretch just before, to show the change.
 */
export function overview(
  loads: ReportLoad[],
  today: string,
  period: OverviewPeriod
) {
  const both =
    period === "1year"
      ? monthlySeries(loads, today, 24)
      : weeklySeries(loads, today, period === "30days" ? 10 : 26)
  const half = both.length / 2
  const points = both.slice(half)
  return {
    points,
    total: sumPoints(points),
    previous: sumPoints(both.slice(0, half)),
  }
}

/**
 * This month so far, and last month up to the same day (the 31st becomes
 * the 30th in a 30-day month), so the two compare like for like.
 */
export function monthToDate(loads: ReportLoad[], today: string) {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const day = Number(today.slice(8, 10))
  const thisStart = monthStart(year, month)
  const lastStart = monthStart(year, month - 1)
  const lastLength = new Date(
    Date.UTC(Number(lastStart.slice(0, 4)), Number(lastStart.slice(5, 7)), 0)
  ).getUTCDate()
  const lastEnd = `${lastStart.slice(0, 8)}${pad(Math.min(day, lastLength))}`
  return {
    current: totals(
      loads.filter(
        (l) => l.delivered_on >= thisStart && l.delivered_on <= today
      )
    ),
    previous: totals(
      loads.filter(
        (l) => l.delivered_on >= lastStart && l.delivered_on <= lastEnd
      )
    ),
  }
}

/** The change from `previous` to `current` as a fraction; null with nothing to compare to. */
export function change(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null
  return (current - previous) / Math.abs(previous)
}

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
})
const perMile = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const wholeUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

/** "34%", or "—" when there's nothing to divide by. */
export const formatPercent = (value: number | null) =>
  value === null ? "—" : percent.format(value)

/** "$2.41", or "—". */
export const formatPerMile = (value: number | null) =>
  value === null ? "—" : perMile.format(value)

/** "$12,450", rounded to the dollar for summaries. */
export const formatDollars = (value: number) => wholeUsd.format(value)

/** "12,480" */
export const formatMiles = (value: number) => number.format(value)
