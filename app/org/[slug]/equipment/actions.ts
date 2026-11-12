"use server"

import { refresh } from "next/cache"

import { canManage, getMyOrganizations } from "@/lib/organizations"
import {
  truckSchema,
  truckStatusSchema,
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
    if (error.message.includes("trucks_organization_motive_idx")) {
      return "Another truck is already linked to this Motive vehicle."
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
  input: TruckValues
): Promise<ActionResult> {
  if (!(await canManageTrucks(organizationId))) {
    return { error: NOT_ALLOWED }
  }

  const parsed = truckSchema.safeParse(input)
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
