/**
 * IFTA, the quarterly fuel tax report: quarters and their due dates, the
 * jurisdictions, and the by-state summary a return is filled in from.
 * Pure functions, so the page and the dashboard agree and tests can run
 * them.
 */

// Keep in step with public.is_ifta_jurisdiction() in the IFTA migration.
// The lower 48 states, then the 10 member provinces. Alaska, Hawaii and DC
// aren't IFTA members.
export const IFTA_JURISDICTIONS = [
  "AL", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "ID", "IL", "IN",
  "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT",
  "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "AB", "BC", "MB", "NB", "NL", "NS", "ON", "PE", "QC", "SK",
] as const // prettier-ignore

export type IftaJurisdiction = (typeof IFTA_JURISDICTIONS)[number]

export const JURISDICTION_NAMES: Record<IftaJurisdiction, string> = {
  AL: "Alabama", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida",
  GA: "Georgia", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska",
  NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba",
  NB: "New Brunswick", NL: "Newfoundland and Labrador", NS: "Nova Scotia",
  ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec",
  SK: "Saskatchewan",
} // prettier-ignore

export function isIftaJurisdiction(code: string): code is IftaJurisdiction {
  return (IFTA_JURISDICTIONS as readonly string[]).includes(code)
}

// ------------------------------------------------------------ Quarters ---

export type Quarter = { year: number; quarter: 1 | 2 | 3 | 4 }

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] // prettier-ignore

const pad = (n: number) => String(n).padStart(2, "0")

/** The last day of a month (1–12), "YYYY-MM-DD". */
function lastDay(year: number, month: number) {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${pad(month)}-${pad(day)}`
}

/** The quarter a "YYYY-MM-DD" day falls in. */
export function quarterOf(day: string): Quarter {
  const year = Number(day.slice(0, 4))
  const month = Number(day.slice(5, 7))
  return { year, quarter: Math.ceil(month / 3) as Quarter["quarter"] }
}

/** "2026-Q4", for the URL. */
export const quarterKey = ({ year, quarter }: Quarter) => `${year}-Q${quarter}`

/** Reads "2026-Q4" back, or null if it isn't one. */
export function parseQuarter(key: string | null | undefined): Quarter | null {
  const match = /^(\d{4})-Q([1-4])$/.exec(key ?? "")
  if (!match) return null
  return {
    year: Number(match[1]),
    quarter: Number(match[2]) as Quarter["quarter"],
  }
}

/** The first and last day, "YYYY-MM-DD". */
export function quarterRange({ year, quarter }: Quarter) {
  const firstMonth = (quarter - 1) * 3 + 1
  return {
    start: `${year}-${pad(firstMonth)}-01`,
    end: lastDay(year, firstMonth + 2),
  }
}

/**
 * When the return is due: the last day of the month after the quarter
 * (April 30, July 31, October 31, January 31). A due date on a weekend or
 * holiday moves to the next business day, which the base state sets.
 */
export function dueDate({ year, quarter }: Quarter) {
  return quarter === 4 ? `${year + 1}-01-31` : lastDay(year, quarter * 3 + 1)
}

/** "Q4 2026", and with `months` "Q4 2026 (Oct–Dec)". */
export function quarterLabel({ year, quarter }: Quarter, months = false) {
  const label = `Q${quarter} ${year}`
  if (!months) return label
  const first = (quarter - 1) * 3
  return `${label} (${MONTHS[first]}–${MONTHS[first + 2]})`
}

/** The quarter before. */
export function previousQuarter({ year, quarter }: Quarter): Quarter {
  return quarter === 1
    ? { year: year - 1, quarter: 4 }
    : { year, quarter: (quarter - 1) as Quarter["quarter"] }
}

/** The quarter `today` is in and the `count - 1` before it, newest first. */
export function recentQuarters(today: string, count = 8): Quarter[] {
  const quarters = [quarterOf(today)]
  while (quarters.length < count) {
    quarters.push(previousQuarter(quarters.at(-1)!))
  }
  return quarters
}

/**
 * The quarter to open on: the one just ended while its return is still due,
 * since that's the one to file; otherwise the quarter in progress.
 */
export function defaultQuarter(today: string): Quarter {
  const last = previousQuarter(quarterOf(today))
  return today <= dueDate(last) ? last : quarterOf(today)
}

// ------------------------------------------------------------- Summary ---

export type StateMiles = { jurisdiction: string; miles: number }
export type FuelPurchase = { jurisdiction: string; gallons: number }

export type StateLine = {
  jurisdiction: string
  miles: number
  /** Gallons bought there. */
  purchased: number
  /** Gallons burned there: miles at the fleet's MPG. Null without an MPG. */
  taxable: number | null
  /** Taxable less purchased: positive owes tax, negative is a credit. */
  net: number | null
}

/** Gallons to three places, as receipts show them. */
const gallons3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * The return, state by state. The fleet's MPG is total miles over total
 * gallons, to two places, as IFTA returns round it. Each state's taxable
 * gallons are its miles at that MPG, rounded to whole gallons.
 */
export function iftaSummary(miles: StateMiles[], fuel: FuelPurchase[]) {
  const byState = new Map<string, { miles: number; purchased: number }>()
  const line = (code: string) => {
    let entry = byState.get(code)
    if (!entry) {
      entry = { miles: 0, purchased: 0 }
      byState.set(code, entry)
    }
    return entry
  }
  for (const row of miles) line(row.jurisdiction).miles += row.miles
  for (const row of fuel) line(row.jurisdiction).purchased += row.gallons

  const totalMiles = miles.reduce((sum, row) => sum + row.miles, 0)
  const totalGallons = gallons3(fuel.reduce((sum, row) => sum + row.gallons, 0))
  const mpg =
    totalMiles > 0 && totalGallons > 0
      ? Math.round((totalMiles / totalGallons) * 100) / 100
      : null

  const lines: StateLine[] = [...byState.entries()]
    .map(([jurisdiction, { miles, purchased }]) => {
      const taxable = mpg === null ? null : Math.round(miles / mpg)
      return {
        jurisdiction,
        miles,
        purchased: gallons3(purchased),
        taxable,
        net: taxable === null ? null : gallons3(taxable - purchased),
      }
    })
    .sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction))

  return { lines, totalMiles, totalGallons, mpg }
}

/** The summary as CSV, for a spreadsheet or the state's upload. */
export function summaryCsv(lines: StateLine[]) {
  const rows = [
    ["Jurisdiction", "Miles", "Taxable gallons", "Gallons purchased", "Net taxable gallons"],
    ...lines.map((line) => [
      line.jurisdiction,
      String(line.miles),
      line.taxable === null ? "" : String(line.taxable),
      String(line.purchased),
      line.net === null ? "" : String(line.net),
    ]),
  ] // prettier-ignore
  return rows.map((row) => row.join(",")).join("\n") + "\n"
}

/**
 * Loaded and empty miles on loads delivered in the quarter, by truck: a
 * check on the miles entered by state. Loads without a truck are left out.
 */
export function loadMilesByTruck(
  loads: {
    delivered_on: string
    miles: number | null
    empty_miles: number | null
    truck: { id: string | null } | null
  }[],
  quarter: Quarter
) {
  const { start, end } = quarterRange(quarter)
  const byTruck: Record<string, number> = {}
  for (const load of loads) {
    const truckId = load.truck?.id
    if (!truckId || load.delivered_on < start || load.delivered_on > end) {
      continue
    }
    byTruck[truckId] =
      (byTruck[truckId] ?? 0) + (load.miles ?? 0) + (load.empty_miles ?? 0)
  }
  return byTruck
}
