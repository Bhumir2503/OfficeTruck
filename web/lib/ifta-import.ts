/**
 * Reading IFTA miles and fuel purchases from CSV files: an ELD's state
 * mileage report, a trip-sheet spreadsheet, or a fuel card export. Every
 * provider names its columns differently, so columns are guessed from
 * common header names and the person can fix the guess before importing.
 * Pure functions, run in the browser; nothing is saved here.
 */

import {
  IFTA_JURISDICTIONS,
  isIftaJurisdiction,
  JURISDICTION_NAMES,
  quarterLabel,
  quarterRange,
  type IftaJurisdiction,
  type Quarter,
} from "@/lib/ifta-format"

/** The most rows one import takes. */
export const MAX_IMPORT_ROWS = 2000

// ---------------------------------------------------------------- CSV ---

/**
 * Splits CSV text into rows of cells: quoted cells may hold commas, quotes
 * ("") and line breaks; a byte-order mark and blank lines are dropped. A
 * file saved with semicolons or tabs between cells is read that way.
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "")
  const firstLine = source.split(/\r?\n/, 1)[0] ?? ""
  const delimiter = [",", ";", "\t"].reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length
      ? candidate
      : best
  )

  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
    } else if (char === '"' && cell === "") {
      quoted = true
    } else if (char === delimiter) {
      row.push(cell)
      cell = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else {
      cell += char
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
    .map((cells) => cells.map((value) => value.trim()))
    .filter((cells) => cells.some((value) => value !== ""))
}

// ------------------------------------------------------------ Columns ---

export type ImportKind = "miles" | "fuel"

export type MilesField = "truck" | "jurisdiction" | "miles"
export type FuelField =
  "truck" | "date" | "jurisdiction" | "gallons" | "amount" | "vendor"
export type ImportField = MilesField | FuelField

export const FIELDS: Record<ImportKind, ImportField[]> = {
  miles: ["truck", "jurisdiction", "miles"],
  fuel: ["date", "truck", "jurisdiction", "gallons", "amount", "vendor"],
}

/** Fields an import can't do without. The truck can instead be chosen for every row. */
export const REQUIRED: Record<ImportKind, ImportField[]> = {
  miles: ["jurisdiction", "miles"],
  fuel: ["date", "jurisdiction", "gallons"],
}

export const FIELD_LABELS: Record<ImportField, string> = {
  truck: "Truck",
  date: "Date",
  jurisdiction: "State",
  miles: "Miles",
  gallons: "Gallons",
  amount: "Amount",
  vendor: "Where",
}

/** Header names each field is known by, most specific first, in lowercase. */
const HEADER_NAMES: Record<ImportField, string[]> = {
  truck: [
    "unit", "unit #", "unit number", "unit no", "truck", "truck #",
    "truck number", "truck no", "vehicle", "vehicle name", "vehicle id",
    "tractor", "tractor #", "power unit",
  ],
  date: [
    "date", "transaction date", "purchase date", "trans date", "posted date",
    "fuel date",
  ],
  jurisdiction: [
    "jurisdiction", "state", "state/province", "state code", "province",
    "st", "location state", "merchant state", "fuel state",
  ],
  miles: [
    "miles", "total miles", "distance", "distance (mi)", "miles driven",
    "taxable miles", "jurisdiction miles", "mileage",
  ],
  gallons: [
    "gallons", "gals", "gal", "fuel gallons", "quantity", "qty", "units",
    "diesel gallons", "tractor gallons",
  ],
  amount: [
    "amount", "total", "total amount", "cost", "fuel amount", "net amount",
    "price total", "total cost",
  ],
  vendor: [
    "vendor", "merchant", "merchant name", "truck stop", "location",
    "station", "site", "location name",
  ],
} // prettier-ignore

/** Which column (by index) each field reads, or null when none does. */
export type ColumnMap = Partial<Record<ImportField, number | null>>

const normal = (header: string) =>
  header.toLowerCase().replace(/[_.]+/g, " ").replace(/\s+/g, " ").trim()

/**
 * Guesses each field's column from the header row: an exact name first,
 * then a header that starts with one. A column is used for one field only.
 */
export function guessColumns(headers: string[], kind: ImportKind): ColumnMap {
  const names = headers.map(normal)
  const taken = new Set<number>()
  const map: ColumnMap = {}
  for (const field of FIELDS[kind]) {
    const known = HEADER_NAMES[field]
    let found = -1
    for (const name of known) {
      found = names.findIndex((header, i) => !taken.has(i) && header === name)
      if (found >= 0) break
    }
    if (found < 0) {
      for (const name of known) {
        // "Miles (Total)", "State Code", but not "st" matching "station".
        if (name.length < 4) continue
        found = names.findIndex(
          (header, i) => !taken.has(i) && header.startsWith(name)
        )
        if (found >= 0) break
      }
    }
    map[field] = found >= 0 ? found : null
    if (found >= 0) taken.add(found)
  }
  return map
}

// -------------------------------------------------------------- Values ---

const NAME_TO_CODE = new Map<string, IftaJurisdiction>(
  IFTA_JURISDICTIONS.map((code) => [
    JURISDICTION_NAMES[code].toLowerCase(),
    code,
  ])
)

/** "TX", "tx", "Texas" or "Texas (TX)" → "TX"; null for anything else. */
export function readJurisdiction(value: string): IftaJurisdiction | null {
  const text = value.trim()
  const upper = text.toUpperCase()
  if (isIftaJurisdiction(upper)) return upper
  const named = NAME_TO_CODE.get(text.toLowerCase().replace(/\s*\(.*\)$/, ""))
  if (named) return named
  const inParens = /\(([A-Za-z]{2})\)$/.exec(text)?.[1]?.toUpperCase()
  return inParens && isIftaJurisdiction(inParens) ? inParens : null
}

/** "1,240", "$512.40", "1 240.5" → a number; null when it isn't one. */
export function readNumber(value: string): number | null {
  const text = value.replace(/[$,\s]/g, "")
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  return Number(text)
}

const pad = (n: number) => String(n).padStart(2, "0")

/**
 * A date as US exports write it, "11/27/2026", "11/27/26", or ISO
 * "2026-11-27" (with or without a time after it), → "YYYY-MM-DD".
 */
export function readDate(value: string): string | null {
  const text = value.trim()
  let year: number, month: number, day: number
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(text)
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s.*)?$/.exec(text)
  if (iso) {
    ;[year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  } else if (us) {
    month = Number(us[1])
    day = Number(us[2])
    year = Number(us[3])
    if (year < 100) year += 2000
  } else {
    return null
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return `${year}-${pad(month)}-${pad(day)}`
}

const unitKey = (unit: string) => unit.trim().toLowerCase().replace(/^#/, "")

// ---------------------------------------------------------------- Rows ---

export type MilesImportRow = {
  truck_id: string
  jurisdiction: IftaJurisdiction
  miles: number
}

export type FuelImportRow = {
  truck_id: string
  purchased_on: string
  jurisdiction: IftaJurisdiction
  gallons: number
  amount: number | null
  vendor: string | null
}

/** One line of the file as the preview shows it. */
export type PreviewLine<T> = {
  /** The line number in the file, counting the header as 1. */
  line: number
  row: T | null
  /** Why the row can't be imported; null when it can. */
  problem: string | null
  /** The truck's name, for the preview. */
  truck: string | null
}

type Truck = { id: string; name: string }

/**
 * Turns the file's rows into rows to save, or the reason each one can't
 * be. `fallbackTruck` is used for every row when no column names a truck.
 */
function readRows<T>(
  rows: string[][],
  map: ColumnMap,
  trucks: Truck[],
  fallbackTruck: string | null,
  read: (cell: (field: ImportField) => string, truck: Truck) => T | string
): PreviewLine<T>[] {
  const byUnit = new Map(trucks.map((truck) => [unitKey(truck.name), truck]))
  const byId = new Map(trucks.map((truck) => [truck.id, truck]))
  return rows.slice(1, MAX_IMPORT_ROWS + 1).map((cells, i) => {
    const line = i + 2
    const cell = (field: ImportField) => {
      const index = map[field]
      return index === null || index === undefined ? "" : (cells[index] ?? "")
    }
    let truck: Truck | undefined
    if (map.truck !== null && map.truck !== undefined) {
      const unit = cell("truck")
      truck = byUnit.get(unitKey(unit))
      if (!truck) {
        return {
          line,
          row: null,
          truck: unit || null,
          problem: unit ? `No truck numbered ${unit}` : "No truck",
        }
      }
    } else {
      truck = fallbackTruck ? byId.get(fallbackTruck) : undefined
      if (!truck) {
        return { line, row: null, truck: null, problem: "Choose the truck" }
      }
    }
    const result = read(cell, truck)
    return typeof result === "string"
      ? { line, row: null, truck: truck.name, problem: result }
      : { line, row: result, truck: truck.name, problem: null }
  })
}

const stateProblem = (value: string) =>
  value ? `${value} isn't an IFTA state or province` : "No state"

export function readMilesRows(
  rows: string[][],
  map: ColumnMap,
  trucks: Truck[],
  fallbackTruck: string | null
) {
  return readRows<MilesImportRow>(
    rows,
    map,
    trucks,
    fallbackTruck,
    (cell, truck) => {
      const jurisdiction = readJurisdiction(cell("jurisdiction"))
      if (!jurisdiction) return stateProblem(cell("jurisdiction"))
      const miles = readNumber(cell("miles"))
      if (miles === null)
        return cell("miles") ? "Miles isn't a number" : "No miles"
      // A state with no miles is fine in a report; there's nothing to save.
      if (miles === 0) return "0 miles"
      if (miles < 0 || miles > 1_000_000) return "Miles out of range"
      return { truck_id: truck.id, jurisdiction, miles: Math.round(miles) }
    }
  )
}

export function readFuelRows(
  rows: string[][],
  map: ColumnMap,
  trucks: Truck[],
  fallbackTruck: string | null,
  quarter: Quarter
) {
  const { start, end } = quarterRange(quarter)
  return readRows<FuelImportRow>(
    rows,
    map,
    trucks,
    fallbackTruck,
    (cell, truck) => {
      const date = readDate(cell("date"))
      if (!date)
        return cell("date") ? `Can't read the date ${cell("date")}` : "No date"
      if (date < start || date > end) return `Not in ${quarterLabel(quarter)}`
      const jurisdiction = readJurisdiction(cell("jurisdiction"))
      if (!jurisdiction) return stateProblem(cell("jurisdiction"))
      const gallons = readNumber(cell("gallons"))
      if (gallons === null) {
        return cell("gallons") ? "Gallons isn't a number" : "No gallons"
      }
      if (gallons <= 0 || gallons > 10_000) return "Gallons out of range"
      const amount = cell("amount") ? readNumber(cell("amount")) : null
      const vendor = cell("vendor").slice(0, 120) || null
      return {
        truck_id: truck.id,
        purchased_on: date,
        jurisdiction,
        gallons: Math.round(gallons * 1000) / 1000,
        amount:
          amount !== null && amount >= 0 && amount <= 99_999_999.99
            ? Math.round(amount * 100) / 100
            : null,
        vendor,
      }
    }
  )
}

/**
 * Miles for the same truck and state on several lines (a trip sheet with a
 * line per trip) are added together, so each state is saved once.
 */
export function combineMiles(rows: MilesImportRow[]): MilesImportRow[] {
  const combined = new Map<string, MilesImportRow>()
  for (const row of rows) {
    const key = `${row.truck_id}:${row.jurisdiction}`
    const existing = combined.get(key)
    if (existing) existing.miles += row.miles
    else combined.set(key, { ...row })
  }
  return [...combined.values()]
}

/** What makes two fuel purchases the same one, for skipping repeats. */
export const fuelKey = (row: {
  truck_id: string
  purchased_on: string
  jurisdiction: string
  gallons: number
}) =>
  `${row.truck_id}:${row.purchased_on}:${row.jurisdiction}:${Number(row.gallons).toFixed(3)}`

type Purchase = {
  truck_id: string
  purchased_on: string
  jurisdiction: string
  gallons: number
  amount: number | null
}

/**
 * The quarter's purchases: those entered on the IFTA page and fuel
 * receipts on loads, newest first. A purchase entered both ways (same
 * truck, day, state and gallons) counts once, as the load's.
 */
export function mergeFuel<
  E extends Purchase,
  L extends Purchase & { load: { id: string; reference: string } | null },
>(entered: E[], fromLoads: L[]): (L | (E & { load: null }))[] {
  const onLoads = new Set(fromLoads.map(fuelKey))
  return [
    ...fromLoads,
    // numeric columns come back as strings.
    ...entered
      .map((row) => ({
        ...row,
        gallons: Number(row.gallons),
        amount: row.amount === null ? null : Number(row.amount),
        load: null,
      }))
      .filter((row) => !onLoads.has(fuelKey(row))),
  ].sort((a, b) => b.purchased_on.localeCompare(a.purchased_on))
}
