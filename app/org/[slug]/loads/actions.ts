"use server"

import { refresh } from "next/cache"

import { getMyOrganizations, getUser } from "@/lib/organizations"
import {
  loadAssignmentSchema,
  loadSchema,
  loadStatusSchema,
  type LoadAssignmentValues,
  type LoadStatus,
  type LoadValues,
} from "@/lib/schemas/load"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { ok: true }
const DRIVER_NOT_FOUND = "That driver isn't in this organization anymore."

export type CreateLoadResult = { error: string } | { ok: true; id: string }

async function isMember(organizationId: string) {
  const user = await getUser()
  return (
    !!user &&
    (await getMyOrganizations()).some((org) => org.id === organizationId)
  )
}

/** Adds a load. Values are validated again here; the form's check is for show. */
export async function createLoad(
  organizationId: string,
  input: LoadValues
): Promise<CreateLoadResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }

  const parsed = loadSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("loads")
    .insert({ ...parsed.data, organization_id: organizationId })
    .select("id")
    .single()

  if (error) {
    if (error.code === "23505") {
      return {
        error: `Load ${parsed.data.reference} already exists. Use a different load number.`,
      }
    }
    if (error.code === "23503") {
      return { error: DRIVER_NOT_FOUND }
    }
    return { error: error.message }
  }

  refresh()
  return { ok: true, id: data.id }
}

export async function updateLoadStatus(
  organizationId: string,
  loadId: string,
  status: LoadStatus
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }

  const parsed = loadStatusSchema.safeParse(status)
  if (!parsed.success) {
    return { error: "Choose a valid status." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("loads")
    .update({ status: parsed.data })
    .eq("organization_id", organizationId)
    .eq("id", loadId)
    .select("id")

  if (error) {
    return { error: error.message }
  }
  // Row-level security skips the update, rather than failing.
  if (!data.length) {
    return { error: "That load doesn't exist anymore." }
  }

  refresh()
  return { ok: true }
}

/** Changes who drove a load and how many miles it was. */
export async function updateLoadAssignment(
  organizationId: string,
  loadId: string,
  input: LoadAssignmentValues
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }

  const parsed = loadAssignmentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("loads")
    .update(parsed.data)
    .eq("organization_id", organizationId)
    .eq("id", loadId)
    .select("id")

  if (error) {
    return { error: error.code === "23503" ? DRIVER_NOT_FOUND : error.message }
  }
  // Row-level security skips the update, rather than failing.
  if (!data.length) {
    return { error: "That load doesn't exist anymore." }
  }

  refresh()
  return { ok: true }
}
