"use server"

import { refresh } from "next/cache"

import {
  DATED_ON_DRIVER,
  isDriverDocumentKind,
} from "@/lib/driver-document-format"
import { today } from "@/lib/driver-format"
import { getDriver } from "@/lib/drivers"
import { syncChecklist } from "@/lib/dq/service"
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
  // until the file's start date is set.
  await syncChecklist(await createClient(), driverId, today())
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

/**
 * Changes only how a driver is paid. The rest of the driver is read back
 * and checked with the same rules as the full form, so the pay rules (a
 * rate for every type, percent at most 100) stay in one place.
 */
export async function updateDriverPay(
  organizationId: string,
  driverId: string,
  input: { pay_type: string; pay_rate: string }
): Promise<ActionResult> {
  if (!(await canManageDrivers(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const driver = await getDriver(organizationId, driverId)
  if (!driver) {
    return { error: "That driver doesn't exist anymore." }
  }
  const parsed = driverSchema.safeParse({
    ...driver,
    pay_type: input.pay_type,
    pay_rate: input.pay_rate,
  })
  if (!parsed.success) {
    const issue =
      parsed.error.issues.find((item) =>
        ["pay_type", "pay_rate"].includes(String(item.path[0]))
      ) ?? parsed.error.issues[0]
    return { error: issue?.message ?? "Check the pay rate." }
  }
  return update(organizationId, driverId, {
    pay_type: parsed.data.pay_type,
    pay_rate: parsed.data.pay_rate,
  })
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

  return update(organizationId, driverId, { status: parsed.data })
}

async function update(
  organizationId: string,
  driverId: string,
  values: Partial<DriverValues> & {
    status?: DriverStatus
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
    expires_on: (!DATED_ON_DRIVER[input.kind] && input.expires_on) || null,
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
