"use server"

import { refresh } from "next/cache"

import {
  DATED_ON_DRIVER,
  isDriverDocumentKind,
  UNDATED_DRIVER_KINDS,
} from "@/lib/driver-document-format"
import { today } from "@/lib/driver-format"
import { reopenAfterReturn, syncChecklist } from "@/lib/dq/service"
import { canManage, getMyOrganizations } from "@/lib/organizations"
import {
  driverSchema,
  driverStatusSchema,
  type DriverStatus,
  type DriverValues,
} from "@/lib/schemas/driver"
import { createClient } from "@/lib/supabase/server"

/** A database error as a message, naming the one people can fix. */
function saveError(error: { code?: string; message: string }) {
  if (error.code === "23505" && error.message.includes("login_phone")) {
    return "Another driver already has that phone number. Each driver signs in with their own."
  }
  if (error.code === "23514" && error.message.includes("end_after_start")) {
    return "The start date can't be after the day they left."
  }
  if (error.code === "23514" && error.message.includes("medical_exam_before")) {
    return "The exam date can't be after the medical card expires."
  }
  return error.message
}

export type ActionResult = { error: string } | { ok: true }
export type CreateDriverResult = { error: string } | { ok: true; id: string }

const NOT_ALLOWED = "Only owners and admins can manage drivers."

/**
 * Whether the signed-in user can add and edit this organization's drivers.
 * Row-level security enforces the same rule; this gives a clearer message.
 */
async function canManageDrivers(organizationId: string) {
  const organization = (await getMyOrganizations()).find(
    (org) => org.id === organizationId
  )
  return !!organization && canManage(organization)
}

/** Adds a driver. Values are validated again here; the form's check is for show. */
export async function createDriver(
  organizationId: string,
  input: DriverValues
): Promise<CreateDriverResult> {
  if (!(await canManageDrivers(organizationId))) {
    return { error: NOT_ALLOWED }
  }

  const parsed = driverSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("drivers")
    .insert({ ...cdlCleaned(parsed.data), organization_id: organizationId })
    .select("id")
    .single()

  if (error) {
    return { error: saveError(error) }
  }
  // Added with a start date: build their qualification file's checklist
  // now, as saving the date later does.
  if (parsed.data.start_date) {
    await syncChecklist(supabase, data.id, today())
  }

  refresh()
  return { ok: true, id: data.id }
}

export async function updateDriver(
  organizationId: string,
  driverId: string,
  input: DriverValues
): Promise<ActionResult> {
  if (!(await canManageDrivers(organizationId))) {
    return { error: NOT_ALLOWED }
  }

  const parsed = driverSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." }
  }

  const result = await update(organizationId, driverId, cdlCleaned(parsed.data))
  if ("error" in result) {
    return result
  }
  // A new license state can call for more of the qualification file (a
  // hiring driving record per state); add those items. Nothing happens
  // until the file's start date is set. A removed state's record comes off.
  const synced = await syncChecklist(await createClient(), driverId, today())
  if (!synced.ok) {
    // The driver is saved; say so, so saving again retries the file.
    return {
      error: `Saved, but the qualification file couldn't be updated: ${synced.error}`,
    }
  }
  return result
}

/** The other license states, without the CDL state or repeats. */
function cdlCleaned<T extends DriverValues>(values: T): T {
  return {
    ...values,
    prior_license_states: [
      ...new Set(
        values.prior_license_states.filter((s) => s !== values.cdl_state)
      ),
    ],
  }
}

/** Saves only a driver's notes, from the notes box beside the driver page. */
export async function updateDriverNotes(
  organizationId: string,
  driverId: string,
  notes: string
): Promise<ActionResult> {
  if (!(await canManageDrivers(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const trimmed = notes.trim()
  if (trimmed.length > 2000) {
    return { error: "Keep notes under 2,000 characters." }
  }
  return update(organizationId, driverId, { notes: trimmed || null })
}

export async function setDriverStatus(
  organizationId: string,
  driverId: string,
  status: DriverStatus
): Promise<ActionResult> {
  if (!(await canManageDrivers(organizationId))) {
    return { error: NOT_ALLOWED }
  }

  const parsed = driverStatusSchema.safeParse(status)
  if (!parsed.success) {
    return { error: "Choose a valid status." }
  }

  // Back to active: they're driving again, so a last day from when they
  // left no longer applies.
  const result = await update(
    organizationId,
    driverId,
    parsed.data === "active"
      ? { status: "active", end_date: null }
      : { status: parsed.data }
  )
  if ("error" in result || parsed.data !== "active") return result

  // And their qualification file reopens: what leaving closed goes back
  // on it, and anything missing since is added.
  const supabase = await createClient()
  const reopened = await reopenAfterReturn(supabase, driverId)
  const synced = reopened.ok
    ? await syncChecklist(supabase, driverId, today())
    : reopened
  if (!synced.ok) {
    return {
      error: `Marked active, but the qualification file couldn't be reopened: ${synced.error}`,
    }
  }
  return result
}

/**
 * Deletes a driver added by mistake, with their documents, settlements and
 * checklist. One who has run loads is refused by the database, and one
 * whose qualification file has uploads or signatures is refused here, since
 * those records must be kept; both are marked inactive instead.
 */
export async function deleteDriver(
  organizationId: string,
  driverId: string
): Promise<ActionResult> {
  if (!(await canManageDrivers(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const supabase = await createClient()
  const [dqDocuments, dqSignatures, documents] = await Promise.all([
    supabase
      .from("dq_documents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("driver_id", driverId),
    supabase
      .from("dq_attestations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("driver_id", driverId),
    supabase
      .from("driver_documents")
      .select("path")
      .eq("organization_id", organizationId)
      .eq("driver_id", driverId),
  ])
  for (const result of [dqDocuments, dqSignatures, documents]) {
    if (result.error) {
      return { error: result.error.message }
    }
  }
  if ((dqDocuments.count ?? 0) > 0 || (dqSignatures.count ?? 0) > 0) {
    return {
      error:
        "This driver's qualification file has records that must be kept, so they can't be deleted. Mark them inactive instead.",
    }
  }

  const { data, error } = await supabase
    .from("drivers")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", driverId)
    .select("id")
  if (error) {
    return {
      error:
        error.code === "23503"
          ? "This driver has loads linked to them, so they can't be deleted. Mark them inactive instead."
          : error.message,
    }
  }
  if (!data.length) {
    return { error: "That driver doesn't exist anymore." }
  }
  // Best effort: the records went with the driver; leftover files are harmless.
  const files = (documents.data ?? []).map((row) => row.path as string)
  if (files.length) {
    await supabase.storage.from("driver-documents").remove(files)
  }
  return { ok: true }
}

async function update(
  organizationId: string,
  driverId: string,
  values: Partial<DriverValues> & {
    status?: DriverStatus
    end_date?: string | null
    // Saved from the notes box, not the form.
    notes?: string | null
  }
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("drivers")
    .update(values)
    .eq("organization_id", organizationId)
    .eq("id", driverId)
    .select("id")

  if (error) {
    return { error: saveError(error) }
  }
  // Row-level security skips the update, rather than failing.
  if (!data.length) {
    return { error: "That driver doesn't exist anymore." }
  }

  refresh()
  return { ok: true }
}

/** Records a file already uploaded to the driver's folder in driver-documents. */
export async function addDriverDocument(
  organizationId: string,
  driverId: string,
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
  if (!(await canManageDrivers(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  // Callers can send anything, so check the kind is one of ours.
  if (!isDriverDocumentKind(input.kind)) {
    return { error: "Choose what kind of document it is." }
  }
  const title = input.title.trim()
  if (input.kind === "other" && !title) {
    return { error: "Say what the document is." }
  }
  if (input.expires_on && !/^\d{4}-\d{2}-\d{2}$/.test(input.expires_on)) {
    return { error: "Enter the expiration date." }
  }
  // Only files directly in this driver's own folder. Both ids are UUIDs, so
  // they're safe to put in the pattern once checked.
  if (!/^[0-9a-f-]{36}$/.test(driverId)) {
    return { error: "That driver doesn't exist anymore." }
  }
  if (
    !new RegExp(
      `^${organizationId}/${driverId}/[\\w-]+\\.(webp|png|jpe?g|pdf)$`
    ).test(input.path)
  ) {
    return { error: "That file isn't in this driver's folder." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("driver_documents").insert({
    organization_id: organizationId,
    driver_id: driverId,
    kind: input.kind,
    title: title ? title.slice(0, 200) : null,
    // CDL and medical card dates are kept on the driver.
    // Its own date only: not for a kind dated on the driver (CDL, medical
    // card) or one that doesn't expire (a W-9).
    expires_on:
      (!DATED_ON_DRIVER[input.kind] &&
        !UNDATED_DRIVER_KINDS.includes(input.kind) &&
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
          ? "That driver doesn't exist anymore."
          : error.code === "23514"
            ? "That file couldn't be added. Try uploading it again."
            : error.message,
    }
  }
  refresh()
  return { ok: true }
}

/**
 * Renames one of a driver's documents. Only the name changes; if the new
 * one leaves off the file's extension (.pdf, .jpg), it's kept.
 */
export async function renameDriverDocument(
  organizationId: string,
  driverId: string,
  documentId: string,
  name: string
): Promise<ActionResult> {
  if (!(await canManageDrivers(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const trimmed = name.trim().replace(/[\\/]/g, "-")
  if (!trimmed) {
    return { error: "Enter a name." }
  }

  const supabase = await createClient()
  const { data: current } = await supabase
    .from("driver_documents")
    .select("file_name")
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .eq("id", documentId)
    .maybeSingle()
  if (!current) {
    return { error: "That document doesn't exist anymore." }
  }
  const extension = /\.[a-z0-9]{2,5}$/i.exec(current.file_name)?.[0] ?? ""
  const fileName =
    extension && !trimmed.toLowerCase().endsWith(extension.toLowerCase())
      ? `${trimmed}${extension}`
      : trimmed
  if (fileName.length > 200) {
    return { error: "Keep the name under 200 characters." }
  }

  const { data, error } = await supabase
    .from("driver_documents")
    .update({ file_name: fileName })
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .eq("id", documentId)
    .select("id")
  if (error) {
    return { error: error.message }
  }
  // Row-level security skips the update, rather than failing.
  if (!data.length) {
    return { error: NOT_ALLOWED }
  }
  refresh()
  return { ok: true }
}

/** Deletes one of a driver's documents and its file. */
export async function removeDriverDocument(
  organizationId: string,
  driverId: string,
  id: string
): Promise<ActionResult> {
  if (!(await canManageDrivers(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("driver_documents")
    .delete()
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
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
    .from("driver-documents")
    .remove(data.map((row) => row.path))
  refresh()
  return { ok: true }
}

export type ApplyRateResult = { error: string } | { ok: true; changed: number }

/**
 * Moves a driver's booked and dispatched loads onto their current pay rate. Loads in
 * transit, delivered or invoiced keep the rate they were locked at.
 */
export async function applyRateToUpcomingLoads(
  organizationId: string,
  driverId: string
): Promise<ApplyRateResult> {
  if (!(await canManageDrivers(organizationId))) {
    return { error: NOT_ALLOWED }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    "apply_driver_rate_to_upcoming_loads",
    { target_driver: driverId }
  )
  if (error) {
    return {
      error:
        error.hint === "not_found"
          ? "That driver doesn't exist anymore."
          : error.hint === "not_allowed"
            ? NOT_ALLOWED
            : error.message,
    }
  }

  refresh()
  return { ok: true, changed: Number(data) }
}
