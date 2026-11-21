"use server"

import { refresh } from "next/cache"

import { canManage, getMyOrganizations } from "@/lib/organizations"
import {
  DATED_ON_TRUCK,
  isTruckDocumentKind,
} from "@/lib/truck-document-format"
import {
  truckCostsSchema,
  truckDetailsSchema,
  truckSchema,
  truckStatusSchema,
  type TruckCostsValues,
  type TruckDetailsValues,
  type TruckStatus,
  type TruckValues,
} from "@/lib/schemas/truck"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { ok: true }
export type CreateTruckResult = { error: string } | { ok: true; id: string }

const NOT_ALLOWED = "Only owners and admins can manage trucks."

/**
 * Whether the signed-in user can add and edit this organization's trucks.
 * Row-level security enforces the same rule; this gives a clearer message.
 */
async function canManageTrucks(organizationId: string) {
  const organization = (await getMyOrganizations()).find(
    (org) => org.id === organizationId
  )
  return !!organization && canManage(organization)
}

/** Turns a database error into something to show on the form. */
function message(
  error: { code?: string; message: string },
  values?: Partial<TruckValues>
) {
  if (error.code === "23505") {
    if (error.message.includes("trucks_organization_unit_idx")) {
      return `Unit ${values?.unit_number ?? ""} is already taken. Use a different unit number.`
    }
    if (error.message.includes("trucks_organization_vin_idx")) {
      return "Another truck already has this VIN."
    }
  }
  if (error.code === "23503") {
    return "That driver isn't in this organization anymore."
  }
  return error.message
}

/** Adds a truck. Values are validated again here; the form's check is for show. */
export async function createTruck(
  organizationId: string,
  input: TruckValues
): Promise<CreateTruckResult> {
  if (!(await canManageTrucks(organizationId))) {
    return { error: NOT_ALLOWED }
  }

  const parsed = truckSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trucks")
    .insert({ ...parsed.data, organization_id: organizationId })
    .select("id")
    .single()

  if (error) {
    return { error: message(error, parsed.data) }
  }

  refresh()
  return { ok: true, id: data.id }
}

export async function updateTruck(
  organizationId: string,
  truckId: string,
  input: TruckDetailsValues
): Promise<ActionResult> {
  if (!(await canManageTrucks(organizationId))) {
    return { error: NOT_ALLOWED }
  }

  // Fixed costs and notes aren't on the edit form; they save on their own.
  const parsed = truckDetailsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." }
  }

  return update(organizationId, truckId, parsed.data)
}

export async function setTruckStatus(
  organizationId: string,
  truckId: string,
  status: TruckStatus
): Promise<ActionResult> {
  if (!(await canManageTrucks(organizationId))) {
    return { error: NOT_ALLOWED }
  }

  const parsed = truckStatusSchema.safeParse(status)
  if (!parsed.success) {
    return { error: "Choose a valid status." }
  }

  return update(organizationId, truckId, { status: parsed.data })
}

async function update(
  organizationId: string,
  truckId: string,
  values: Partial<TruckValues> & { status?: TruckStatus }
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trucks")
    .update(values)
    .eq("organization_id", organizationId)
    .eq("id", truckId)
    .select("id")

  if (error) {
    return { error: message(error, values) }
  }
  // Row-level security skips the update, rather than failing.
  if (!data.length) {
    return { error: "That truck doesn't exist anymore." }
  }

  refresh()
  return { ok: true }
}

/** Saves a truck's fixed costs, from the box beside the truck page. */
export async function updateTruckCosts(
  organizationId: string,
  truckId: string,
  input: Record<keyof TruckCostsValues, string>
): Promise<ActionResult> {
  if (!(await canManageTrucks(organizationId))) {
    return { error: NOT_ALLOWED }
  }

  const parsed = truckCostsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the amounts." }
  }

  return update(organizationId, truckId, parsed.data)
}

/** Saves a truck's notes, from the box beside the truck page. */
export async function updateTruckNotes(
  organizationId: string,
  truckId: string,
  notes: string
): Promise<ActionResult> {
  if (!(await canManageTrucks(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const trimmed = notes.trim()
  if (trimmed.length > 2000) {
    return { error: "Keep notes under 2,000 characters." }
  }
  return update(organizationId, truckId, { notes: trimmed || null })
}

/** Records a file already uploaded to the truck's folder in truck-documents. */
export async function addTruckDocument(
  organizationId: string,
  truckId: string,
  input: {
    kind: string
    title: string
    expires_on: string
    path: string
    file_name: string
    content_type: string
    size_bytes: number
  }
): Promise<ActionResult> {
  if (!(await canManageTrucks(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  // Callers can send anything, so check the kind is one of ours.
  if (!isTruckDocumentKind(input.kind)) {
    return { error: "Choose what kind of document it is." }
  }
  const title = input.title.trim()
  if (input.kind === "other" && !title) {
    return { error: "Say what the document is." }
  }
  if (input.expires_on && !/^\d{4}-\d{2}-\d{2}$/.test(input.expires_on)) {
    return { error: "Enter the expiration date." }
  }
  // Only files directly in this truck's own folder. Both ids are UUIDs, so
  // they're safe to put in the pattern once checked.
  if (!/^[0-9a-f-]{36}$/.test(truckId)) {
    return { error: "That truck doesn't exist anymore." }
  }
  if (
    !new RegExp(
      `^${organizationId}/${truckId}/[\\w-]+\\.(webp|png|jpe?g|pdf)$`
    ).test(input.path)
  ) {
    return { error: "That file isn't in this truck's folder." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("truck_documents").insert({
    organization_id: organizationId,
    truck_id: truckId,
    kind: input.kind,
    title: title ? title.slice(0, 200) : null,
    // Registration, inspection and 2290 dates are kept on the truck.
    expires_on: (!DATED_ON_TRUCK[input.kind] && input.expires_on) || null,
    path: input.path,
    file_name: input.file_name.trim().slice(0, 200) || "Document",
    content_type: input.content_type,
    size_bytes: input.size_bytes,
  })
  if (error) {
    return {
      error:
        error.code === "23503"
          ? "That truck doesn't exist anymore."
          : error.code === "23514"
            ? "That file couldn't be added. Try uploading it again."
            : error.message,
    }
  }
  refresh()
  return { ok: true }
}

/** Deletes one of a truck's documents and its file. */
export async function removeTruckDocument(
  organizationId: string,
  truckId: string,
  id: string
): Promise<ActionResult> {
  if (!(await canManageTrucks(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("truck_documents")
    .delete()
    .eq("organization_id", organizationId)
    .eq("truck_id", truckId)
    .eq("id", id)
    .select("path")
  if (error) {
    return { error: error.message }
  }
  if (!data.length) {
    return { error: "That document is already gone." }
  }
  // Best effort: a leftover file is harmless, and the record is already gone.
  await supabase.storage
    .from("truck-documents")
    .remove(data.map((row) => row.path))
  refresh()
  return { ok: true }
}
