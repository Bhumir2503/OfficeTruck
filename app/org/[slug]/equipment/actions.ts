"use server"

import { refresh } from "next/cache"

import { canManage, getMyOrganizations } from "@/lib/organizations"
import {
  DATED_ON_TRUCK,
  isTruckDocumentKind,
} from "@/lib/truck-document-format"
import {
  maintenanceSchema,
  outOfServiceSchema,
  truckCostsSchema,
  truckDetailsSchema,
  truckSchema,
  truckStatusSchema,
  type TruckCostsValues,
  type TruckDetailsValues,
  type MaintenanceValues,
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

/**
 * Moves a truck between active, out of service and inactive. Out of service
 * can say why and until when; any other status clears both.
 */
export async function setTruckStatus(
  organizationId: string,
  truckId: string,
  status: TruckStatus,
  outOfService?: { reason: string; until: string }
): Promise<ActionResult> {
  if (!(await canManageTrucks(organizationId))) {
    return { error: NOT_ALLOWED }
  }

  const parsed = truckStatusSchema.safeParse(status)
  if (!parsed.success) {
    return { error: "Choose a valid status." }
  }
  const details = outOfServiceSchema.safeParse(
    outOfService ?? { reason: "", until: "" }
  )
  if (!details.success) {
    return { error: details.error.issues[0]?.message ?? "Check the details." }
  }
  const parked = parsed.data === "out_of_service"

  return update(organizationId, truckId, {
    status: parsed.data,
    out_of_service_reason: parked ? details.data.reason : null,
    out_of_service_until: parked ? details.data.until : null,
  })
}

/**
 * Deletes a truck added by mistake, with its documents and maintenance.
 * One that has run loads or is on a 2290 is refused by the database; those
 * are marked inactive instead, so their history stays.
 */
export async function deleteTruck(
  organizationId: string,
  truckId: string
): Promise<ActionResult> {
  if (!(await canManageTrucks(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const supabase = await createClient()
  const { data: files } = await supabase
    .from("truck_documents")
    .select("path")
    .eq("organization_id", organizationId)
    .eq("truck_id", truckId)

  const { data, error } = await supabase
    .from("trucks")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", truckId)
    .select("id")
  if (error) {
    return {
      error:
        error.code === "23503"
          ? "This truck has loads or is on a 2290, so it can't be deleted. Mark it inactive instead."
          : error.message,
    }
  }
  if (!data.length) {
    return { error: "That truck doesn't exist anymore." }
  }
  // Best effort: the records went with the truck; leftover files are harmless.
  if (files?.length) {
    await supabase.storage
      .from("truck-documents")
      .remove(files.map((file) => file.path))
  }
  return { ok: true }
}

async function update(
  organizationId: string,
  truckId: string,
  values: Partial<TruckValues> & {
    status?: TruckStatus
    out_of_service_reason?: string | null
    out_of_service_until?: string | null
  }
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
    // Registration and 2290 dates are kept on the truck and its filings;
    // the inspection report's date is when it was done, not an expiry.
    expires_on:
      (!DATED_ON_TRUCK[input.kind] &&
        input.kind !== "annual_inspection" &&
        input.expires_on) ||
      null,
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
  // An inspection report dated later than the truck's last inspection
  // moves that date up, so the next one is due a year from it.
  if (input.kind === "annual_inspection" && input.expires_on) {
    await supabase
      .from("trucks")
      .update({ annual_inspection_on: input.expires_on })
      .eq("organization_id", organizationId)
      .eq("id", truckId)
      .or(
        `annual_inspection_on.is.null,annual_inspection_on.lt.${input.expires_on}`
      )
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

/**
 * Logs a service, repair or inspection. A higher odometer reading than the
 * truck's own moves the truck's reading up, for maintenance reminders.
 */
export async function addTruckMaintenance(
  organizationId: string,
  truckId: string,
  input: MaintenanceValues
): Promise<ActionResult> {
  if (!(await canManageTrucks(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const parsed = maintenanceSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the entry." }
  }
  const entry = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from("truck_maintenance").insert({
    organization_id: organizationId,
    truck_id: truckId,
    ...entry,
  })
  if (error) {
    return {
      error:
        error.code === "23503"
          ? "That truck doesn't exist anymore."
          : error.message,
    }
  }

  if (entry.odometer !== null) {
    const { data: truck } = await supabase
      .from("trucks")
      .select("odometer")
      .eq("organization_id", organizationId)
      .eq("id", truckId)
      .maybeSingle()
    // Odometers only go up, so only a higher reading replaces it.
    if (truck && (truck.odometer === null || entry.odometer > truck.odometer)) {
      // Best effort: the entry is saved either way.
      await supabase
        .from("trucks")
        .update({ odometer: entry.odometer, odometer_on: entry.done_on })
        .eq("organization_id", organizationId)
        .eq("id", truckId)
    }
  }
  refresh()
  return { ok: true }
}

/** Removes one entry from a truck's maintenance log. */
export async function removeTruckMaintenance(
  organizationId: string,
  truckId: string,
  id: string
): Promise<ActionResult> {
  if (!(await canManageTrucks(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("truck_maintenance")
    .delete()
    .eq("organization_id", organizationId)
    .eq("truck_id", truckId)
    .eq("id", id)
    .select("id")
  if (error) {
    return { error: error.message }
  }
  if (!data.length) {
    return { error: "That entry is already gone." }
  }
  refresh()
  return { ok: true }
}
