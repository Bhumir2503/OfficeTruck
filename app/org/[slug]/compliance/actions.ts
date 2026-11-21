"use server"

import { refresh } from "next/cache"

import { canManage, getMyOrganizations } from "@/lib/organizations"
import { taxFilingSchema, type TaxFilingValues } from "@/lib/schemas/truck"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { ok: true }
export type SaveFilingResult = { error: string } | { ok: true; id: string }

const NOT_ALLOWED = "Only owners and admins can record 2290 filings."

async function canManageFilings(organizationId: string) {
  const organization = (await getMyOrganizations()).find(
    (org) => org.id === organizationId
  )
  return !!organization && canManage(organization)
}

/** A Schedule 1 already uploaded to the organization's 2290 folder. */
export type Schedule1Upload = { path: string; name: string; type: string }

/**
 * Records a 2290 return, or updates one on file (`filingId`): its tax year,
 * when it was filed, notes, exactly which trucks it covers, and its stamped
 * Schedule 1 when a new one is attached. A tax year can have several
 * returns: the yearly one, then one for each truck added later.
 */
export async function saveTaxFiling(
  organizationId: string,
  input: TaxFilingValues,
  filingId: string | null,
  schedule1?: Schedule1Upload
): Promise<SaveFilingResult> {
  if (!(await canManageFilings(organizationId))) {
    return { error: NOT_ALLOWED }
  }

  const parsed = taxFilingSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." }
  }
  const { truck_ids, ...filing } = parsed.data
  if (
    schedule1 &&
    (!new RegExp(
      `^${organizationId}/2290/schedule1-[\\w-]+\\.(webp|pdf)$`
    ).test(schedule1.path) ||
      !["image/webp", "application/pdf"].includes(schedule1.type))
  ) {
    return {
      error: "That Schedule 1 couldn't be added. Try uploading it again.",
    }
  }
  const file = schedule1
    ? {
        schedule1_path: schedule1.path,
        schedule1_name: schedule1.name.trim().slice(0, 200) || "Schedule 1",
        schedule1_type: schedule1.type,
      }
    : {}

  const supabase = await createClient()
  let saved: { id: string }
  // The Schedule 1 this return had, to delete once a new one replaces it.
  let replaced: string | null = null
  if (filingId) {
    const { data: before } = await supabase
      .from("heavy_vehicle_tax_filings")
      .select("schedule1_path")
      .eq("organization_id", organizationId)
      .eq("id", filingId)
      .maybeSingle()
    if (!before) {
      return { error: "That return doesn't exist anymore." }
    }
    replaced = schedule1 ? before.schedule1_path : null
    const { data, error } = await supabase
      .from("heavy_vehicle_tax_filings")
      .update({ ...filing, ...file })
      .eq("organization_id", organizationId)
      .eq("id", filingId)
      .select("id")
      .single()
    if (error) {
      return { error: error.message }
    }
    saved = data
  } else {
    const { data, error } = await supabase
      .from("heavy_vehicle_tax_filings")
      .insert({ ...filing, ...file, organization_id: organizationId })
      .select("id")
      .single()
    if (error) {
      return { error: error.message }
    }
    saved = data
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

  // Best effort: the return already points at its new Schedule 1.
  if (replaced) {
    await supabase.storage.from("truck-documents").remove([replaced])
  }
  refresh()
  return { ok: true, id: saved.id }
}

/** Deletes a 2290 return recorded by mistake, with its Schedule 1. */
export async function deleteTaxFiling(
  organizationId: string,
  filingId: string
): Promise<ActionResult> {
  if (!(await canManageFilings(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("heavy_vehicle_tax_filings")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", filingId)
    .select("schedule1_path")
  if (error) {
    return { error: error.message }
  }
  if (!data.length) {
    return { error: "That return is already gone." }
  }
  const files = data
    .map((row) => row.schedule1_path)
    .filter((path): path is string => !!path)
  // Best effort: a leftover file is harmless, and the return is already gone.
  if (files.length) {
    await supabase.storage.from("truck-documents").remove(files)
  }
  refresh()
  return { ok: true }
}
