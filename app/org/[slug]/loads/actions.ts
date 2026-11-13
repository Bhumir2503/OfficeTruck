"use server"

import { refresh } from "next/cache"

import { isStale } from "@/lib/broker-format"
import { checkFmcsa, FMCSA_COLUMNS, type FmcsaRecord } from "@/lib/fmcsa"
import { getMyOrganizations, getUser } from "@/lib/organizations"
import {
  accessorialSchema,
  type AccessorialValues,
  loadAssignmentSchema,
  loadBrokerSchema,
  type LoadBrokerValues,
  loadDetailsSchema,
  type LoadDetailsValues,
  loadSchema,
  loadStatusSchema,
  loadStopsSchema,
  type LoadStopsValues,
  type LoadAssignmentValues,
  LOAD_STATUS_LABELS,
  type LoadStatus,
  type LoadValues,
  rateRevisionSchema,
  type RateRevisionValues,
  STATUSES_NEEDING_ASSIGNMENT,
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

/** Turns an error from one of the load functions into a message. */
function rpcError(error: {
  code?: string
  message: string
  hint?: string | null
}) {
  // The functions raise with a readable message and a hint saying which.
  if (error.hint && error.code !== "23505" && error.code !== "23503") {
    return error.message
  }
  if (error.code === "23503") {
    return error.message.includes("loads_broker_fkey")
      ? "That broker isn't in this organization anymore."
      : error.message.includes("loads_truck_fkey")
        ? "That truck isn't in this organization anymore."
        : DRIVER_NOT_FOUND
  }
  return error.message
}

/**
 * Adds a load with its stops and charges, in one transaction. Values are
 * validated again here; the form's check is for show.
 */
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

  const { stops, charges, ...details } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_load", {
    target_organization: organizationId,
    details,
    stops,
    charges,
  })

  if (error) {
    if (error.code === "23505") {
      return {
        error: `Load ${details.reference} already exists. Use a different load number.`,
      }
    }
    return { error: rpcError(error) }
  }

  // A new rate con from a broker is the moment to re-check them with FMCSA.
  // Skipped when the last check is recent; a failure doesn't stop the load.
  if (details.broker_id) {
    await recheckBroker(organizationId, details.broker_id).catch(() => {})
  }

  refresh()
  return { ok: true, id: data as string }
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

  // Truck and driver can stay empty until the load is dispatched.
  if (STATUSES_NEEDING_ASSIGNMENT.includes(parsed.data)) {
    const { data: load } = await supabase
      .from("loads")
      .select("truck_id, driver_id")
      .eq("organization_id", organizationId)
      .eq("id", loadId)
      .maybeSingle()
    if (load && (!load.truck_id || !load.driver_id)) {
      return {
        error: `Assign a truck and driver before marking it ${LOAD_STATUS_LABELS[parsed.data].toLowerCase()}.`,
      }
    }
  }

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

/** Changes the load number and what's being hauled. */
export async function updateLoadDetails(
  organizationId: string,
  loadId: string,
  input: LoadDetailsValues
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  const parsed = loadDetailsSchema.safeParse(input)
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
    return {
      error:
        error.code === "23505"
          ? `Load ${parsed.data.reference} already exists. Use a different load number.`
          : error.message,
    }
  }
  if (!data.length) {
    return { error: "That load doesn't exist anymore." }
  }
  refresh()
  return { ok: true }
}

/** Adds, changes, reorders or removes a load's stops. */
export async function saveLoadStops(
  organizationId: string,
  loadId: string,
  input: LoadStopsValues
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  const parsed = loadStopsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the stops." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("save_load_stops", {
    target_load: loadId,
    stops: parsed.data.stops,
  })
  if (error) {
    return { error: rpcError(error) }
  }
  refresh()
  return { ok: true }
}

/** The driver taps arrived or departed at a stop. The time is the server's. */
export async function recordStopEvent(
  organizationId: string,
  stopId: string,
  event: "arrived" | "departed"
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  if (event !== "arrived" && event !== "departed") {
    return { error: "Unknown stop event." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("record_stop_event", {
    target_stop: stopId,
    event,
  })
  if (error) {
    return { error: rpcError(error) }
  }
  refresh()
  return { ok: true }
}

/**
 * A person enters a new set of rate con charges (a revised rate con). It's
 * applied straight away and kept as a new version.
 */
export async function reviseLoadRate(
  organizationId: string,
  loadId: string,
  input: RateRevisionValues
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  const parsed = rateRevisionSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the charges." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("revise_load_rate", {
    target_load: loadId,
    charges: parsed.data.charges,
    free_hours: parsed.data.detention_free_hours,
    hourly_rate: parsed.data.detention_rate,
    note: parsed.data.note,
    approve: true,
  })
  if (error) {
    return { error: rpcError(error) }
  }
  refresh()
  return { ok: true }
}

/** Approves or rejects a rate version waiting for review. */
export async function reviewRateVersion(
  organizationId: string,
  versionId: string,
  approve: boolean
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("review_load_rate_version", {
    target_version: versionId,
    approve,
  })
  if (error) {
    return { error: rpcError(error) }
  }
  refresh()
  return { ok: true }
}

/** Adds a charge run up on the road: detention, lumper, TONU… */
export async function addAccessorial(
  organizationId: string,
  loadId: string,
  input: AccessorialValues
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  const parsed = accessorialSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the charge." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("load_charges").insert({
    ...parsed.data,
    organization_id: organizationId,
    load_id: loadId,
    source: "accessorial",
  })
  if (error) {
    return {
      error:
        error.code === "23503"
          ? "That load doesn't exist anymore."
          : error.message,
    }
  }
  refresh()
  return { ok: true }
}

/** Removes an accessorial. Rate con lines change only through a new version. */
export async function removeAccessorial(
  organizationId: string,
  chargeId: string
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("load_charges")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", chargeId)
    .eq("source", "accessorial")
    .select("id")
  if (error) {
    return { error: error.message }
  }
  if (!data.length) {
    return { error: "That charge doesn't exist anymore." }
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

/** Changes the broker on a load (or links a typed name to a broker), and who sent the rate con. */
export async function updateLoadBroker(
  organizationId: string,
  loadId: string,
  input: LoadBrokerValues
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }

  const parsed = loadBrokerSchema.safeParse(input)
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
    return {
      error:
        error.code === "23503"
          ? "That broker isn't in this organization anymore."
          : error.message,
    }
  }
  if (!data.length) {
    return { error: "That load doesn't exist anymore." }
  }

  if (parsed.data.broker_id) {
    await recheckBroker(organizationId, parsed.data.broker_id).catch(() => {})
  }
  refresh()
  return { ok: true }
}
