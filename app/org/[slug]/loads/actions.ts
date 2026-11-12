"use server"

import { refresh } from "next/cache"

import { isStale } from "@/lib/broker-format"
import { checkFmcsa, FMCSA_COLUMNS, type FmcsaRecord } from "@/lib/fmcsa"
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
/** Runs the FMCSA check for a broker if their record is a day old or more. */
async function recheckBroker(organizationId: string, brokerId: string) {
  const supabase = await createClient()
  const { data: broker } = await supabase
    .from("brokers")
    .select("mc_number")
    .eq("organization_id", organizationId)
    .eq("id", brokerId)
    .maybeSingle()
  if (!broker?.mc_number) return
  const { data: record } = await supabase
    .from("fmcsa_records")
    .select(FMCSA_COLUMNS)
    .eq("mc_number", broker.mc_number)
    .maybeSingle()
  if (isStale(record as FmcsaRecord | null)) {
    await checkFmcsa(broker.mc_number)
  }
}

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
      return {
        error: error.message.includes("loads_broker_fkey")
          ? "That broker isn't in this organization anymore."
          : error.message.includes("loads_truck_fkey")
            ? "That truck isn't in this organization anymore."
            : DRIVER_NOT_FOUND,
      }
    }
    return { error: error.message }
  }

  // A new rate con from a broker is the moment to re-check them with FMCSA.
  // Skipped when the last check is recent; a failure doesn't stop the load.
  if (parsed.data.broker_id) {
    await recheckBroker(organizationId, parsed.data.broker_id).catch(() => {})
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
