"use server"

import { refresh } from "next/cache"

import { canManage, getMyOrganizations } from "@/lib/organizations"
import {
  driverSchema,
  driverStatusSchema,
  type DriverStatus,
  type DriverValues,
} from "@/lib/schemas/driver"
import { createClient } from "@/lib/supabase/server"

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
    .insert({ ...parsed.data, organization_id: organizationId })
    .select("id")
    .single()

  if (error) {
    return { error: error.message }
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

  return update(organizationId, driverId, parsed.data)
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
    cdl_photo_path?: string | null
    medical_card_photo_path?: string | null
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
    return { error: error.message }
  }
  // Row-level security skips the update, rather than failing.
  if (!data.length) {
    return { error: "That driver doesn't exist anymore." }
  }

  refresh()
  return { ok: true }
}

const PHOTO_COLUMNS = {
  cdl: "cdl_photo_path",
  medical_card: "medical_card_photo_path",
} as const

/**
 * Points a driver's CDL or medical card photo at a file already uploaded to
 * driver-documents (or clears it with null), then deletes the file it replaces.
 */
export async function setDriverPhoto(
  organizationId: string,
  driverId: string,
  kind: keyof typeof PHOTO_COLUMNS,
  path: string | null
): Promise<ActionResult> {
  if (!(await canManageDrivers(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  // Callers can send anything, so check the kind is one of ours.
  const column = Object.hasOwn(PHOTO_COLUMNS, kind) ? PHOTO_COLUMNS[kind] : null
  if (!column) {
    return { error: "Choose a CDL or medical card photo." }
  }
  // Only files directly in this driver's own folder. Both ids are UUIDs, so
  // they're safe to put in the pattern once checked.
  if (!/^[0-9a-f-]{36}$/.test(driverId)) {
    return { error: "That driver doesn't exist anymore." }
  }
  if (
    path !== null &&
    !new RegExp(
      `^${organizationId}/${driverId}/[\\w-]+\\.(webp|png|jpe?g|pdf)$`
    ).test(path)
  ) {
    return { error: "That file isn't in this driver's folder." }
  }

  const supabase = await createClient()
  const { data: current, error: readError } = await supabase
    .from("drivers")
    .select(column)
    .eq("organization_id", organizationId)
    .eq("id", driverId)
    .maybeSingle()
  if (readError) {
    return { error: readError.message }
  }
  if (!current) {
    return { error: "That driver doesn't exist anymore." }
  }

  const result = await update(organizationId, driverId, { [column]: path })
  if ("error" in result) {
    return result
  }

  const previous = (current as Record<string, string | null>)[column]
  if (previous && previous !== path) {
    // Best effort: a leftover file is harmless, and the record is already right.
    await supabase.storage.from("driver-documents").remove([previous])
  }
  return result
}

export type ApplyRateResult = { error: string } | { ok: true; changed: number }

/**
 * Moves a driver's booked loads onto their current pay rate. Loads in
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
