"use server"

import { refresh } from "next/cache"
import { z } from "zod"

import { getLoadFuel } from "@/lib/ifta"
import { combineMiles, fuelKey, MAX_IMPORT_ROWS } from "@/lib/ifta-import"
import { canManage, getMyOrganizations } from "@/lib/organizations"
import {
  filedSchema,
  fuelPurchaseSchema,
  quarterSchema,
  stateMilesSchema,
} from "@/lib/schemas/ifta"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { ok: true }

const NOT_ALLOWED = "Only owners and admins can change IFTA records."
const GONE = "That truck isn't in this organization anymore."

/** Row-level security enforces the same rule; this gives a clearer message. */
async function allowed(organizationId: string) {
  const organization = (await getMyOrganizations()).find(
    (org) => org.id === organizationId
  )
  return !!organization && canManage(organization)
}

const firstIssue = (error: { issues: { message: string }[] }) =>
  error.issues[0]?.message ?? "Check the entry."

/**
 * Sets a truck's miles in one state for a quarter. Entering a state that
 * already has miles replaces them, so a corrected figure doesn't double up.
 */
export async function setStateMiles(
  organizationId: string,
  input: unknown
): Promise<ActionResult> {
  if (!(await allowed(organizationId))) return { error: NOT_ALLOWED }
  const parsed = stateMilesSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const row = parsed.data

  const supabase = await createClient()
  const { data: existing, error: findError } = await supabase
    .from("ifta_state_miles")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("truck_id", row.truck_id)
    .eq("year", row.year)
    .eq("quarter", row.quarter)
    .eq("jurisdiction", row.jurisdiction)
    .maybeSingle()
  if (findError) return { error: findError.message }

  const { error } = existing
    ? await supabase
        .from("ifta_state_miles")
        .update({ miles: row.miles, source: "manual" })
        .eq("organization_id", organizationId)
        .eq("id", existing.id)
    : await supabase
        .from("ifta_state_miles")
        .insert({ organization_id: organizationId, ...row })
  if (error) {
    return { error: error.code === "23503" ? GONE : error.message }
  }
  refresh()
  return { ok: true }
}

export async function removeStateMiles(
  organizationId: string,
  id: string
): Promise<ActionResult> {
  if (!(await allowed(organizationId))) return { error: NOT_ALLOWED }
  const supabase = await createClient()
  const { error } = await supabase
    .from("ifta_state_miles")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", id)
  if (error) return { error: error.message }
  refresh()
  return { ok: true }
}

export async function addFuelPurchase(
  organizationId: string,
  input: unknown
): Promise<ActionResult> {
  if (!(await allowed(organizationId))) return { error: NOT_ALLOWED }
  const parsed = fuelPurchaseSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const supabase = await createClient()
  const { error } = await supabase
    .from("ifta_fuel_purchases")
    .insert({ organization_id: organizationId, ...parsed.data })
  if (error) {
    return { error: error.code === "23503" ? GONE : error.message }
  }
  refresh()
  return { ok: true }
}

export async function removeFuelPurchase(
  organizationId: string,
  id: string
): Promise<ActionResult> {
  if (!(await allowed(organizationId))) return { error: NOT_ALLOWED }
  const supabase = await createClient()
  const { error } = await supabase
    .from("ifta_fuel_purchases")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", id)
  if (error) return { error: error.message }
  refresh()
  return { ok: true }
}

/** Marks a quarter's return as filed with the base state. */
export async function markIftaFiled(
  organizationId: string,
  input: unknown
): Promise<ActionResult> {
  if (!(await allowed(organizationId))) return { error: NOT_ALLOWED }
  const parsed = filedSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const supabase = await createClient()
  const { error } = await supabase
    .from("ifta_filings")
    .insert({ organization_id: organizationId, ...parsed.data })
  // Already marked (another tab, a double click): that's what was wanted.
  if (error && error.code !== "23505") return { error: error.message }
  refresh()
  return { ok: true }
}

export async function unmarkIftaFiled(
  organizationId: string,
  input: unknown
): Promise<ActionResult> {
  if (!(await allowed(organizationId))) return { error: NOT_ALLOWED }
  const parsed = quarterSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const supabase = await createClient()
  const { error } = await supabase
    .from("ifta_filings")
    .delete()
    .eq("organization_id", organizationId)
    .eq("year", parsed.data.year)
    .eq("quarter", parsed.data.quarter)
  if (error) return { error: error.message }
  refresh()
  return { ok: true }
}

export type ImportResult =
  { error: string } | { ok: true; saved: number; skipped: number }

const importedMiles = z
  .array(stateMilesSchema.omit({ year: true, quarter: true }))
  .min(1, "There's nothing to import.")
  .max(MAX_IMPORT_ROWS, `Import ${MAX_IMPORT_ROWS} rows or fewer at a time.`)

/**
 * Saves miles read from a CSV file for one quarter. A state's miles on
 * several lines are added together, and replace what the truck already has
 * for that state, so importing the same file twice doesn't double them.
 */
export async function importStateMiles(
  organizationId: string,
  quarterInput: unknown,
  rowsInput: unknown
): Promise<ImportResult> {
  if (!(await allowed(organizationId))) return { error: NOT_ALLOWED }
  const quarter = quarterSchema.safeParse(quarterInput)
  if (!quarter.success) return { error: firstIssue(quarter.error) }
  const parsed = importedMiles.safeParse(rowsInput)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const rows = combineMiles(parsed.data)
  const { year, quarter: q } = quarter.data

  const supabase = await createClient()
  const { data: existing, error: findError } = await supabase
    .from("ifta_state_miles")
    .select("id, truck_id, jurisdiction")
    .eq("organization_id", organizationId)
    .eq("year", year)
    .eq("quarter", q)
  if (findError) return { error: findError.message }
  const ids = new Map(
    (existing as { id: string; truck_id: string; jurisdiction: string }[]).map(
      (row) => [`${row.truck_id}:${row.jurisdiction}`, row.id]
    )
  )

  const fresh = rows.filter(
    (row) => !ids.has(`${row.truck_id}:${row.jurisdiction}`)
  )
  if (fresh.length) {
    const { error } = await supabase.from("ifta_state_miles").insert(
      fresh.map((row) => ({
        organization_id: organizationId,
        year,
        quarter: q,
        ...row,
      }))
    )
    if (error) {
      return { error: error.code === "23503" ? GONE : error.message }
    }
  }
  for (const row of rows) {
    const id = ids.get(`${row.truck_id}:${row.jurisdiction}`)
    if (!id) continue
    const { error } = await supabase
      .from("ifta_state_miles")
      .update({ miles: row.miles, source: "manual" })
      .eq("organization_id", organizationId)
      .eq("id", id)
    if (error) return { error: error.message }
  }
  refresh()
  return { ok: true, saved: rows.length, skipped: 0 }
}

const importedFuel = z
  .array(fuelPurchaseSchema)
  .min(1, "There's nothing to import.")
  .max(MAX_IMPORT_ROWS, `Import ${MAX_IMPORT_ROWS} rows or fewer at a time.`)

/**
 * Saves fuel purchases read from a CSV file. A purchase that's already
 * saved (same truck, day, state and gallons), here or as a fuel receipt on
 * a load, is skipped, so importing an export that overlaps doesn't double
 * up.
 */
export async function importFuelPurchases(
  organizationId: string,
  rowsInput: unknown
): Promise<ImportResult> {
  if (!(await allowed(organizationId))) return { error: NOT_ALLOWED }
  const parsed = importedFuel.safeParse(rowsInput)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const rows = parsed.data
  const dates = rows.map((row) => row.purchased_on).sort()

  const supabase = await createClient()
  const { data: existing, error: findError } = await supabase
    .from("ifta_fuel_purchases")
    .select("truck_id, purchased_on, jurisdiction, gallons")
    .eq("organization_id", organizationId)
    .gte("purchased_on", dates[0]!)
    .lte("purchased_on", dates.at(-1)!)
  if (findError) return { error: findError.message }
  // Fuel receipts on loads already count, so they're skipped too.
  const onLoads = await getLoadFuel(organizationId, dates[0]!, dates.at(-1)!)
  const seen = new Set(
    [
      ...(existing as {
        truck_id: string
        purchased_on: string
        jurisdiction: string
        gallons: number
      }[]),
      ...onLoads,
    ].map(fuelKey)
  )

  const fresh = rows.filter((row) => {
    const key = fuelKey(row)
    if (seen.has(key)) return false
    // The same purchase twice in one file counts once too.
    seen.add(key)
    return true
  })
  if (fresh.length) {
    const { error } = await supabase
      .from("ifta_fuel_purchases")
      .insert(fresh.map((row) => ({ organization_id: organizationId, ...row })))
    if (error) {
      return { error: error.code === "23503" ? GONE : error.message }
    }
  }
  refresh()
  return { ok: true, saved: fresh.length, skipped: rows.length - fresh.length }
}
