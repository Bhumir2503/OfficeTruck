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
  values: Partial<DriverValues> & { status?: DriverStatus }
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
