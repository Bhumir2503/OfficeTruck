"use server"

import { refresh } from "next/cache"

import { canManage, getMyOrganizations } from "@/lib/organizations"
import { trailerSchema, type TrailerValues } from "@/lib/schemas/trailer"
import { truckStatusSchema, type TruckStatus } from "@/lib/schemas/truck"
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

/** Deletes a trailer. Nothing else points at trailers, so this always works. */
export async function deleteTrailer(
  organizationId: string,
  trailerId: string
): Promise<ActionResult> {
  if (!(await canManageTrailers(organizationId))) {
    return { error: NOT_ALLOWED }
  }
  const supabase = await createClient()
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
  return { ok: true }
}
