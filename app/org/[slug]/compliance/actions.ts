"use server"

import { refresh } from "next/cache"

import { canManage, getMyOrganizations } from "@/lib/organizations"
import { taxFilingSchema, type TaxFilingValues } from "@/lib/schemas/truck"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { ok: true }

/**
 * Records the 2290 for a tax year, or updates the one on file: when it was
 * filed, notes, and exactly which trucks it covers.
 */
export async function saveTaxFiling(
  organizationId: string,
  input: TaxFilingValues
): Promise<ActionResult> {
  const organization = (await getMyOrganizations()).find(
    (org) => org.id === organizationId
  )
  if (!organization || !canManage(organization)) {
    return { error: "Only owners and admins can record 2290 filings." }
  }

  const parsed = taxFilingSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." }
  }
  const { truck_ids, ...filing } = parsed.data

  const supabase = await createClient()
  // One filing per tax year: add it, or update the one already there.
  const { data: saved, error } = await supabase
    .from("heavy_vehicle_tax_filings")
    .upsert(
      { ...filing, organization_id: organizationId },
      { onConflict: "organization_id,tax_year" }
    )
    .select("id")
    .single()

  if (error) {
    return { error: error.message }
  }

  const { data: current, error: readError } = await supabase
    .from("heavy_vehicle_tax_filing_trucks")
    .select("truck_id")
    .eq("filing_id", saved.id)
  if (readError) {
    return { error: readError.message }
  }

  const wanted = new Set(truck_ids)
  const existing = new Set(current.map((row) => row.truck_id))
  const add = [...wanted].filter((id) => !existing.has(id))
  const remove = [...existing].filter((id) => !wanted.has(id))

  if (add.length) {
    const { error: addError } = await supabase
      .from("heavy_vehicle_tax_filing_trucks")
      .insert(
        add.map((truck_id) => ({
          organization_id: organizationId,
          filing_id: saved.id,
          truck_id,
        }))
      )
    if (addError) {
      return {
        error:
          addError.code === "23503"
            ? "One of those trucks isn't in this organization."
            : addError.message,
      }
    }
  }
  if (remove.length) {
    const { error: removeError } = await supabase
      .from("heavy_vehicle_tax_filing_trucks")
      .delete()
      .eq("filing_id", saved.id)
      .in("truck_id", remove)
    if (removeError) {
      return { error: removeError.message }
    }
  }

  refresh()
  return { ok: true }
}
