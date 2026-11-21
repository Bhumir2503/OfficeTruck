import {
  addYear,
  expiry,
  loadDriverPay,
  type ComplianceItem,
} from "@/lib/driver-format"
import { TAXABLE_WEIGHT_LBS } from "@/lib/schemas/truck"
import type { TaxFiling, Truck, TruckLoad } from "@/lib/trucks"

/** "Truck 12 · 2021 Freightliner Cascadia", or just the unit number. */
export function truckDescription(
  truck: Pick<Truck, "year" | "make" | "model">
) {
  return [truck.year, truck.make, truck.model].filter(Boolean).join(" ")
}

// ---------------------------------------------------------------- 2290 ----

/**
 * The 2290 tax year `date` falls in, by the year it starts: the period runs
 * July 1 to June 30, so 2026-11-12 is in tax year 2026 (2026–27).
 */
export function taxYearOf(date: string) {
  const [year, month] = date.split("-").map(Number)
  return month >= 7 ? year : year - 1
}

/** 2026 → "2026–27" */
export function formatTaxYear(taxYear: number) {
  return `${taxYear}–${String((taxYear + 1) % 100).padStart(2, "0")}`
}

/** The return for a tax year is due by August 31 of its first year. */
export function taxYearDueDate(taxYear: number) {
  return `${taxYear}-08-31`
}

/**
 * Whether a truck owes the 2290: registered at 55,000 lbs or more. With no
 * weight on file it's assumed to, so nothing quietly drops off the list.
 */
export function owes2290(truck: Pick<Truck, "registered_weight_lbs">) {
  return (
    truck.registered_weight_lbs === null ||
    truck.registered_weight_lbs >= TAXABLE_WEIGHT_LBS
  )
}

/** The filing for a tax year that lists this truck, if there is one. */
export function coveringFiling(
  truckId: string,
  taxYear: number,
  filings: TaxFiling[]
) {
  return (
    filings.find(
      (filing) =>
        filing.tax_year === taxYear && filing.truck_ids.includes(truckId)
    ) ?? null
  )
}

/**
 * The 2290 as a compliance item for one truck. Covered for this tax year,
 * it's next due for the following one; not covered, it's due (or overdue)
 * for this one.
 */
export function taxItem(
  truckId: string,
  filings: TaxFiling[],
  today: string
): ComplianceItem & { covered: boolean; taxYear: number } {
  const taxYear = taxYearOf(today)
  const covered = !!coveringFiling(truckId, taxYear, filings)
  const due = taxYearDueDate(covered ? taxYear + 1 : taxYear)
  return {
    key: "form_2290",
    label: "2290",
    kind: "due",
    due,
    expiry: expiry(due, today),
    covered,
    taxYear,
  }
}

// ---------------------------------------------------------- Compliance ----

/** The truck's own dates to keep up with, in the order they're shown. */
export function truckComplianceItems(
  truck: Pick<
    Truck,
    "annual_inspection_on" | "registration_expires_on" | "plate_expires_on"
  >,
  today: string
): ComplianceItem[] {
  const inspectionDue = truck.annual_inspection_on
    ? addYear(truck.annual_inspection_on)
    : null
  return [
    {
      key: "annual_inspection",
      label: "Annual inspection",
      kind: "due",
      due: inspectionDue,
      last: truck.annual_inspection_on,
      expiry: expiry(inspectionDue, today),
    },
    {
      key: "registration",
      label: "Registration",
      kind: "expires",
      due: truck.registration_expires_on,
      expiry: expiry(truck.registration_expires_on, today),
    },
    {
      key: "plate",
      label: "Plate",
      kind: "expires",
      due: truck.plate_expires_on,
      expiry: expiry(truck.plate_expires_on, today),
    },
  ]
}

// ------------------------------------------------ Preventive maintenance ---

const miles = new Intl.NumberFormat("en-US")

/** How close counts as "due soon": two weeks, or 1,000 miles. */
const PM_SOON_DAYS = 14
const PM_SOON_MILES = 1000

export type PmStatus = {
  /** Whether a schedule is set at all. */
  scheduled: boolean
  /** The last preventive service, if any is logged. */
  last: { done_on: string; odometer: number | null } | null
  /** When it's next due by date, and at what mileage. */
  dueOn: string | null
  dueAtMiles: number | null
  /** Miles to go from the last odometer reading; negative when past. */
  milesLeft: number | null
  state: "unscheduled" | "no_history" | "ok" | "soon" | "due"
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

/**
 * When a truck's next preventive maintenance is due: so many days and/or
 * miles after the last one logged, whichever comes first.
 */
export function pmStatus(
  truck: Pick<Truck, "pm_interval_miles" | "pm_interval_days" | "odometer">,
  last: { done_on: string; odometer: number | null } | null,
  today: string
): PmStatus {
  const scheduled = !!(truck.pm_interval_miles || truck.pm_interval_days)
  const base = {
    scheduled,
    last,
    dueOn: null,
    dueAtMiles: null,
    milesLeft: null,
  }
  if (!scheduled) return { ...base, state: "unscheduled" }
  if (!last) return { ...base, state: "no_history" }

  const dueOn = truck.pm_interval_days
    ? addDays(last.done_on, truck.pm_interval_days)
    : null
  const dueAtMiles =
    truck.pm_interval_miles && last.odometer !== null
      ? last.odometer + truck.pm_interval_miles
      : null
  const milesLeft =
    dueAtMiles !== null && truck.odometer !== null
      ? dueAtMiles - truck.odometer
      : null
  const daysLeft = dueOn ? expiry(dueOn, today) : null
  const overdue =
    daysLeft?.state === "expired" || (milesLeft !== null && milesLeft <= 0)
  const soon =
    (daysLeft !== null &&
      daysLeft.state !== "missing" &&
      daysLeft.days <= PM_SOON_DAYS) ||
    (milesLeft !== null && milesLeft <= PM_SOON_MILES)
  return {
    ...base,
    dueOn,
    dueAtMiles,
    milesLeft,
    state: overdue ? "due" : soon ? "soon" : "ok",
  }
}

/**
 * Preventive maintenance as a compliance item, only while it needs action:
 * due soon or overdue, by date or by miles, whichever is more pressing.
 * Null when it's fine, unscheduled or has nothing logged yet.
 */
export function pmItem(pm: PmStatus, today: string): ComplianceItem | null {
  if (pm.state !== "due" && pm.state !== "soon") return null
  const base = { key: "pm", label: "Service", kind: "due" as const }
  const byDate = pm.dueOn ? expiry(pm.dueOn, today) : null
  const dateDriven =
    byDate !== null &&
    byDate.state !== "missing" &&
    (pm.state === "due"
      ? byDate.state === "expired"
      : byDate.days <= PM_SOON_DAYS)
  if (dateDriven) {
    return { ...base, due: pm.dueOn, expiry: byDate }
  }
  // Due by mileage: there's no date to count down to.
  const left = pm.milesLeft ?? 0
  return {
    ...base,
    due: null,
    expiry: { state: pm.state === "due" ? "expired" : "urgent", days: 0 },
    whenText:
      left <= 0
        ? `${miles.format(-left)} mi over`
        : `in ${miles.format(left)} mi`,
  }
}

/** A truck's service as a compliance item, from its last preventive service. */
export function truckServiceItem(
  truck: Pick<Truck, "pm_interval_miles" | "pm_interval_days" | "odometer">,
  last: { done_on: string; odometer: number | null } | null | undefined,
  today: string
) {
  return pmItem(pmStatus(truck, last ?? null, today), today)
}

// ---------------------------------------------------- Cost per mile -------

/** Payment or lease, insurance and other fixed costs, per month. */
export function monthlyFixedCosts(
  truck: Pick<
    Truck,
    "monthly_payment" | "monthly_insurance" | "monthly_other_costs"
  >
) {
  return (
    Number(truck.monthly_payment ?? 0) +
    Number(truck.monthly_insurance ?? 0) +
    Number(truck.monthly_other_costs ?? 0)
  )
}

/** Loaded plus empty miles: what the truck actually drove for a load. */
export function totalMiles(load: Pick<TruckLoad, "miles" | "empty_miles">) {
  return (load.miles ?? 0) + (load.empty_miles ?? 0)
}

const counts = (load: TruckLoad) => load.status !== "cancelled"

/** Monday to Sunday around `today`, as "YYYY-MM-DD". */
export function weekOf(today: string) {
  const date = new Date(`${today}T00:00:00Z`)
  const fromMonday = (date.getUTCDay() + 6) % 7
  const start = new Date(date)
  start.setUTCDate(date.getUTCDate() - fromMonday)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

export type LoadProfit = {
  driverPay: number | null
  /** This load's share of the month's fixed costs, by miles driven. */
  fixedCost: number | null
  /** Rate less driver pay and fixed costs; null if either is unknown. */
  profit: number | null
}

/**
 * Profit on each load. Fixed costs for a month are spread over the miles the
 * truck drove that month (loaded and empty), so each load carries its share.
 */
export function loadProfits(
  truck: Parameters<typeof monthlyFixedCosts>[0],
  loads: TruckLoad[]
): Map<string, LoadProfit> {
  const monthly = monthlyFixedCosts(truck)
  const milesByMonth = new Map<string, number>()
  for (const load of loads.filter(counts)) {
    const month = load.pickup_start.slice(0, 7)
    milesByMonth.set(month, (milesByMonth.get(month) ?? 0) + totalMiles(load))
  }

  const result = new Map<string, LoadProfit>()
  for (const load of loads) {
    if (!counts(load)) {
      result.set(load.id, { driverPay: null, fixedCost: null, profit: null })
      continue
    }
    const pay = loadDriverPay(load)
    const monthMiles = milesByMonth.get(load.pickup_start.slice(0, 7)) ?? 0
    const fixedCost =
      monthly === 0
        ? 0
        : monthMiles > 0
          ? (monthly * totalMiles(load)) / monthMiles
          : null
    result.set(load.id, {
      driverPay: pay,
      fixedCost,
      profit:
        pay === null || fixedCost === null
          ? null
          : Number(load.rate) - pay - fixedCost,
    })
  }
  return result
}

export type WeekSummary = {
  start: string
  end: string
  loads: number
  miles: number
  revenue: number
  driverPay: number
  /** Loads this week whose driver pay can't be worked out. */
  unpriced: number
  /** A week's share of the monthly fixed costs (× 12 ÷ 52). */
  fixedCost: number
  /** (Fixed costs + driver pay) ÷ miles, or null with no miles. */
  costPerMile: number | null
}

/** This week's loads, miles, revenue and cost per mile for one truck. */
export function weekSummary(
  truck: Parameters<typeof monthlyFixedCosts>[0],
  loads: TruckLoad[],
  today: string
): WeekSummary {
  const { start, end } = weekOf(today)
  const week = loads.filter((load) => {
    const day = load.pickup_start.slice(0, 10)
    return counts(load) && day >= start && day <= end
  })
  const miles = week.reduce((sum, load) => sum + totalMiles(load), 0)
  const revenue = week.reduce((sum, load) => sum + Number(load.rate), 0)
  const pays = week.map((load) => loadDriverPay(load))
  const pay = pays.reduce<number>((sum, value) => sum + (value ?? 0), 0)
  const fixedCost = (monthlyFixedCosts(truck) * 12) / 52
  return {
    start,
    end,
    loads: week.length,
    miles,
    revenue,
    driverPay: pay,
    unpriced: pays.filter((value) => value === null).length,
    fixedCost,
    costPerMile: miles > 0 ? (fixedCost + pay) / miles : null,
  }
}

// ------------------------------------------------------------ Billing -----

/** Fleet plan: $25 per active truck per month, $79 minimum. */
export const FLEET_PRICE_PER_TRUCK = 25
export const FLEET_MINIMUM = 79

export function fleetMonthlyPrice(activeTrucks: number) {
  return Math.max(FLEET_MINIMUM, activeTrucks * FLEET_PRICE_PER_TRUCK)
}
