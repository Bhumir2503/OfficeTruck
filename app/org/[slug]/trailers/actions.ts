"use server"

import { refresh } from "next/cache"

import { canManage, getMyOrganizations } from "@/lib/organizations"
import { trailerSchema, type TrailerValues } from "@/lib/schemas/trailer"
import {
  maintenanceSchema,
  truckStatusSchema,
  type MaintenanceValues,
  type TruckStatus,
} from "@/lib/schemas/truck"
import {
  DATED_ON_TRAILER,
  isTrailerDocumentKind,
} from "@/lib/trailer-document-format"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { ok: true }
export type CreateTrailerResult = { error: string } | { ok: true; id: string }

const NOT_ALLOWED = "Only owners and admins can manage trailers."

/**
 * Whether the signed-in user can add and edit this organization's trailers.
 * Row-level security enforces the same rule; this gives a clearer message.
 */
async function canManageTrailers(organizationId: string) {
  const organization = (await getMyOrganizations()).find(
    (org) => org.id === organizationId
  )
  return !!organization && canManage(organization)
}

/** Turns a database error into something to show on the form. */
function message(
  error: { code?: string; message: string },
  values?: Partial<TrailerValues>
) {
  if (error.code === "23505") {
    if (error.message.includes("trailers_organization_unit_idx")) {
      return `Unit ${values?.unit_number ?? ""} is already taken. Use a different unit number.`
    }
    if (error.message.includes("trailers_organization_vin_idx")) {
      return "Another trailer already has this VIN."
    }
  }
  if (error.code === "23503") {
    return "That truck isn't in this organization anymore."
  }
  return error.message
}

/** Adds a trailer. Values are validated again here; the form's check is for show. */
export async function createTrailer(
  organizationId: string,
  input: TrailerValues
): Promise<CreateTrailerResult> {
  if (!(await canManageTrailers(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const parsed = trailerSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trailers")
    .insert({ organization_id: organizationId, ...parsed.data })
    .select("id")
    .single()
  if (error) {
    return { error: message(error, parsed.data) }
  }
  refresh()
  return { ok: true, id: data.id }
}

async function update(
  organizationId: string,
  trailerId: string,
  values: Partial<TrailerValues> & { status?: TruckStatus }
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trailers")
    .update(values)
    .eq("organization_id", organizationId)
    .eq("id", trailerId)
    .select("id")
  if (error) {
    return { error: message(error, values) }
  }
  // Row-level security skips the update, rather than failing.
  if (!data.length) {
    return { error: "That trailer doesn't exist anymore." }
  }
  refresh()
  return { ok: true }
}

export async function updateTrailer(
  organizationId: string,
  trailerId: string,
  input: TrailerValues
): Promise<ActionResult> {
  if (!(await canManageTrailers(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const parsed = trailerSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." }
  }
  return update(organizationId, trailerId, parsed.data)
}

/** Active, out of service or inactive, as for trucks. */
export async function setTrailerStatus(
  organizationId: string,
  trailerId: string,
  status: TruckStatus
): Promise<ActionResult> {
  if (!(await canManageTrailers(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const parsed = truckStatusSchema.safeParse(status)
  if (!parsed.success) {
    return { error: "Choose a valid status." }
  }
  return update(organizationId, trailerId, { status: parsed.data })
}

/**
 * Deletes a trailer, with its maintenance log and documents. Nothing else
 * points at trailers, so this always works.
 */
export async function deleteTrailer(
  organizationId: string,
  trailerId: string
): Promise<ActionResult> {
  if (!(await canManageTrailers(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const supabase = await createClient()
  // Its files go with it: documents, and maintenance receipts.
  const [{ data: documents }, { data: receipts }] = await Promise.all([
    supabase
      .from("trailer_documents")
      .select("path")
      .eq("organization_id", organizationId)
      .eq("trailer_id", trailerId),
    supabase
      .from("trailer_maintenance")
      .select("receipt_path")
      .eq("organization_id", organizationId)
      .eq("trailer_id", trailerId)
      .not("receipt_path", "is", null),
  ])
  const files = [
    ...(documents ?? []).map((row) => row.path as string),
    ...(receipts ?? []).map((row) => row.receipt_path as string),
  ]
  const { data, error } = await supabase
    .from("trailers")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", trailerId)
    .select("id")
  if (error) {
    return { error: error.message }
  }
  if (!data.length) {
    return { error: "That trailer doesn't exist anymore." }
  }
  // Best effort: the records went with the trailer; leftover files are harmless.
  if (files.length) {
    await supabase.storage.from("truck-documents").remove(files)
  }
  return { ok: true }
}

/** A trailer's id and a file path, checked to sit in its own folder. */
function inTrailerFolder(
  organizationId: string,
  trailerId: string,
  path: string,
  prefix = "[\\w-]+"
) {
  return (
    /^[0-9a-f-]{36}$/.test(trailerId) &&
    new RegExp(
      `^${organizationId}/${trailerId}/${prefix}\\.(webp|png|jpe?g|pdf)$`
    ).test(path)
  )
}

/**
 * Logs a service, repair or inspection on a trailer, with a receipt already
 * uploaded to its folder if there is one. An inspection moves the trailer's
 * last annual inspection up to it.
 */
export async function addTrailerMaintenance(
  organizationId: string,
  trailerId: string,
  input: MaintenanceValues,
  receipt: { path: string; name: string; type: string } | null = null
): Promise<ActionResult> {
  if (!(await canManageTrailers(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const parsed = maintenanceSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the entry." }
  }
  const entry = parsed.data
  if (
    receipt &&
    (!inTrailerFolder(
      organizationId,
      trailerId,
      receipt.path,
      "receipt-[\\w-]+"
    ) ||
      !["image/webp", "application/pdf"].includes(receipt.type))
  ) {
    return { error: "That receipt couldn't be added. Try uploading it again." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("trailer_maintenance").insert({
    organization_id: organizationId,
    trailer_id: trailerId,
    ...entry,
    receipt_path: receipt?.path ?? null,
    receipt_name: receipt
      ? receipt.name.trim().slice(0, 200) || "Receipt"
      : null,
    receipt_type: receipt?.type ?? null,
  })
  if (error) {
    return {
      error:
        error.code === "23503"
          ? "That trailer doesn't exist anymore."
          : error.message,
    }
  }
  if (entry.kind === "inspection") {
    await supabase
      .from("trailers")
      .update({ annual_inspection_on: entry.done_on })
      .eq("organization_id", organizationId)
      .eq("id", trailerId)
      .or(
        `annual_inspection_on.is.null,annual_inspection_on.lt.${entry.done_on}`
      )
  }
  refresh()
  return { ok: true }
}

/** Removes one entry from a trailer's maintenance log, with its receipt. */
export async function removeTrailerMaintenance(
  organizationId: string,
  trailerId: string,
  id: string
): Promise<ActionResult> {
  if (!(await canManageTrailers(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trailer_maintenance")
    .delete()
    .eq("organization_id", organizationId)
    .eq("trailer_id", trailerId)
    .eq("id", id)
    .select("receipt_path")
  if (error) {
    return { error: error.message }
  }
  if (!data.length) {
    return { error: "That entry is already gone." }
  }
  const receipts = data
    .map((row) => row.receipt_path)
    .filter((path): path is string => !!path)
  if (receipts.length) {
    await supabase.storage.from("truck-documents").remove(receipts)
  }
  refresh()
  return { ok: true }
}

/** Records a file already uploaded to the trailer's folder. */
export async function addTrailerDocument(
  organizationId: string,
  trailerId: string,
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
  if (!(await canManageTrailers(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  if (!isTrailerDocumentKind(input.kind)) {
    return { error: "Choose what kind of document it is." }
  }
  const title = input.title.trim()
  if (input.kind === "other" && !title) {
    return { error: "Say what the document is." }
  }
  if (input.expires_on && !/^\d{4}-\d{2}-\d{2}$/.test(input.expires_on)) {
    return { error: "Enter the expiration date." }
  }
  if (!inTrailerFolder(organizationId, trailerId, input.path)) {
    return { error: "That file isn't in this trailer's folder." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("trailer_documents").insert({
    organization_id: organizationId,
    trailer_id: trailerId,
    kind: input.kind,
    title: title ? title.slice(0, 200) : null,
    // The registration date is kept on the trailer; the inspection report's
    // date is when it was done, not an expiry.
    expires_on:
      (!DATED_ON_TRAILER[input.kind] &&
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
          ? "That trailer doesn't exist anymore."
          : error.code === "23514"
            ? "That file couldn't be added. Try uploading it again."
            : error.message,
    }
  }
  if (input.kind === "annual_inspection" && input.expires_on) {
    await supabase
      .from("trailers")
      .update({ annual_inspection_on: input.expires_on })
      .eq("organization_id", organizationId)
      .eq("id", trailerId)
      .or(
        `annual_inspection_on.is.null,annual_inspection_on.lt.${input.expires_on}`
      )
  }
  refresh()
  return { ok: true }
}

/** Deletes one of a trailer's documents and its file. */
export async function removeTrailerDocument(
  organizationId: string,
  trailerId: string,
  id: string
): Promise<ActionResult> {
  if (!(await canManageTrailers(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trailer_documents")
    .delete()
    .eq("organization_id", organizationId)
    .eq("trailer_id", trailerId)
    .eq("id", id)
    .select("path")
  if (error) {
    return { error: error.message }
  }
  if (!data.length) {
    return { error: "That document is already gone." }
  }
  await supabase.storage
    .from("truck-documents")
    .remove(data.map((row) => row.path))
  refresh()
  return { ok: true }
}
