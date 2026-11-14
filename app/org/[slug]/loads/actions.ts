"use server"

import { refresh } from "next/cache"

import { isStale } from "@/lib/broker-format"
import { findDriverOverlaps } from "@/lib/dispatch"
import { appUrl } from "@/lib/app-url"
import {
  sendDispatchEmail,
  sendUnassignedEmail,
} from "@/lib/email/dispatch-email"
import { formatStopWindow } from "@/lib/load-format"
import { checkFmcsa, FMCSA_COLUMNS, type FmcsaRecord } from "@/lib/fmcsa"
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/load-document-format"
import {
  type ExpenseReceipt,
  expenseSchema,
  type ExpenseValues,
} from "@/lib/load-expense-format"
import { getMyOrganizations, getUser } from "@/lib/organizations"
import {
  accessorialSchema,
  type AccessorialValues,
  cancelLoadSchema,
  type CancelLoadValues,
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

export type CreateLoadResult =
  { error: string } | { ok: true; id: string; warning?: string }
export type AssignmentResult =
  { error: string } | { ok: true; warning?: string }

/**
 * A warning when the load's driver has another scheduled load at the same
 * time. Driving two loads at once is sometimes fine (a team, a short hop),
 * so it warns rather than refusing.
 */
async function overlapWarning(organizationId: string, loadId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("loads")
    .select("driver_id, driver:drivers!loads_driver_fkey (full_name)")
    .eq("organization_id", organizationId)
    .eq("id", loadId)
    .maybeSingle()
  if (!data?.driver_id) return undefined
  const overlaps = await findDriverOverlaps(
    organizationId,
    data.driver_id,
    loadId
  )
  if (!overlaps.length) return undefined
  const name =
    (data.driver as unknown as { full_name: string } | null)?.full_name ??
    "This driver"
  return `${name} also has ${overlaps.length === 1 ? "load" : "loads"} ${overlaps
    .map((load) => load.reference)
    .join(", ")} at the same time.`
}

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
  const id = data as string
  return { ok: true, id, warning: await overlapWarning(organizationId, id) }
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
  // Canceling takes a reason, so it goes through cancelLoad. The rest of
  // the flow moves on its own (Save and notify, the BOL and POD,
  // check-ins) or through Mark complete; invoicing and payments are manual
  // until they're built.
  if (parsed.data === "cancelled") {
    return { error: "Give a reason for canceling the load." }
  }
  if (!["invoiced", "paid", "factored", "tonu"].includes(parsed.data)) {
    return {
      error:
        "That status is set on its own from the BOL, POD and check-ins. Use Mark complete if they won't come.",
    }
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

/** Cancels a load, with the reason it fell through. */
export async function cancelLoad(
  organizationId: string,
  loadId: string,
  input: CancelLoadValues
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  const parsed = cancelLoadSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Give a reason." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("loads")
    .update({ status: "cancelled", cancel_reason: parsed.data.reason })
    .eq("organization_id", organizationId)
    .eq("id", loadId)
    .select("id")

  if (error) {
    return { error: rpcError(error) }
  }
  if (!data.length) {
    return { error: "That load doesn't exist anymore." }
  }

  refresh()
  return { ok: true }
}

/**
 * Marks a load on the road delivered by hand, for when the POD or the
 * driver's check-in won't come. It shows as "Completed" until
 * they do. Logged.
 */
export async function markLoadComplete(
  organizationId: string,
  loadId: string
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("mark_load_complete", {
    target_load: loadId,
  })
  if (error) {
    return { error: rpcError(error) }
  }
  refresh()
  return { ok: true }
}

/**
 * Takes back a Mark complete: the load goes back to booked if it was
 * completed from booked, otherwise to wherever its BOL, POD and check-ins
 * put it. Returns the status it's now in. Logged.
 */
export async function unmarkLoadComplete(
  organizationId: string,
  loadId: string
): Promise<{ error: string } | { ok: true; status: LoadStatus }> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("unmark_load_complete", {
    target_load: loadId,
  })
  if (error) {
    return { error: rpcError(error) }
  }
  refresh()
  return { ok: true, status: data as LoadStatus }
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
): Promise<AssignmentResult> {
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
  return { ok: true, warning: await overlapWarning(organizationId, loadId) }
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

// ------------------------------------------------------------ Dispatch --

export type DispatchResult =
  | { error: string }
  | {
      ok: true
      /** The driver's private link, to copy or text if the email didn't go. */
      link: string
      /** Why the email wasn't sent, if it wasn't. */
      emailError?: string
      resent: boolean
      warning?: string
    }

/**
 * Sends a load to its driver: records exactly what was sent, moves it to
 * Dispatched (sending again keeps it there and replaces the old link), and
 * emails the driver a private link to it.
 */
export async function sendToDriver(
  organizationId: string,
  loadId: string
): Promise<DispatchResult> {
  const organization = (await getMyOrganizations()).find(
    (org) => org.id === organizationId
  )
  if (!organization) {
    return { error: "You aren't a member of this organization." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc("dispatch_load", { target_load: loadId })
    .single<{
      token: string
      email_to: string | null
      driver_name: string
      resent: boolean
    }>()
  if (error) {
    return { error: rpcError(error) }
  }

  const link = `${await appUrl()}/dispatch/${data.token}`
  let emailError: string | undefined
  if (!data.email_to) {
    emailError = `${data.driver_name} has no email address. Send them the link another way.`
  } else {
    const [{ data: load }, { data: stops }] = await Promise.all([
      supabase.from("loads").select("reference").eq("id", loadId).single(),
      supabase
        .from("load_stops")
        .select("kind, location, appointment_start, appointment_end")
        .eq("load_id", loadId)
        .order("position"),
    ])
    const problem = await sendDispatchEmail({
      to: data.email_to,
      driverName: data.driver_name,
      organizationName: organization.name,
      reference: load?.reference ?? "",
      stops: (stops ?? []).map((stop) => ({
        kind: stop.kind as "pickup" | "delivery",
        location: stop.location,
        when: formatStopWindow(stop.appointment_start, stop.appointment_end),
      })),
      link,
      resent: data.resent,
    })
    if (problem) {
      emailError = `The email to ${data.email_to} didn't send: ${problem}`
    }
  }
  await supabase
    .rpc("record_dispatch_email", {
      target_load: loadId,
      failed: !!emailError,
    })
    .then(
      () => {},
      () => {}
    )

  refresh()
  return {
    ok: true,
    link,
    emailError,
    resent: data.resent,
    warning: await overlapWarning(organizationId, loadId),
  }
}

export type UnassignResult =
  { error: string } | { ok: true; emailError?: string }

/**
 * Takes the truck and driver off a dispatched load and sends it back to
 * Booked, which is logged. The driver's link stops working and they're
 * emailed that the load is off their schedule.
 */
export async function unassignLoad(
  organizationId: string,
  loadId: string
): Promise<UnassignResult> {
  const organization = (await getMyOrganizations()).find(
    (org) => org.id === organizationId
  )
  if (!organization) {
    return { error: "You aren't a member of this organization." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc("unassign_load", { target_load: loadId })
    .single<{ email_to: string | null; driver_name: string | null }>()
  if (error) {
    return { error: rpcError(error) }
  }

  let emailError: string | undefined
  if (data.email_to && data.driver_name) {
    const { data: load } = await supabase
      .from("loads")
      .select("reference")
      .eq("id", loadId)
      .single()
    const problem = await sendUnassignedEmail({
      to: data.email_to,
      driverName: data.driver_name,
      organizationName: organization.name,
      reference: load?.reference ?? "",
    })
    if (problem) {
      emailError = `The email to ${data.email_to} didn't send: ${problem}`
    }
  } else if (data.driver_name) {
    emailError = `${data.driver_name} has no email address, so let them know yourself.`
  }

  refresh()
  return { ok: true, emailError }
}

/** Puts a canceled or TONU load back to Booked, when it was a mistake. Logged. */
export async function reopenLoad(
  organizationId: string,
  loadId: string
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("reopen_load", { target_load: loadId })
  if (error) {
    return { error: rpcError(error) }
  }
  refresh()
  return { ok: true }
}

/** Records a file already uploaded to the load's folder as one of its documents. */
export async function addLoadDocument(
  organizationId: string,
  loadId: string,
  input: {
    kind: DocumentKind
    path: string
    file_name: string
    content_type: string
    size_bytes: number
  }
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  if (!DOCUMENT_KINDS.includes(input.kind)) {
    return { error: "Choose what kind of document it is." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("load_documents").insert({
    organization_id: organizationId,
    load_id: loadId,
    kind: input.kind,
    path: input.path,
    file_name: input.file_name.trim() || "Document",
    content_type: input.content_type,
    size_bytes: input.size_bytes,
  })
  if (error) {
    return {
      error:
        error.code === "23503"
          ? "That load doesn't exist anymore."
          : error.code === "23514"
            ? "That file couldn't be added to this load."
            : error.message,
    }
  }
  refresh()
  return { ok: true }
}

/** Removes a document and its file. */
export async function removeLoadDocument(
  organizationId: string,
  documentId: string
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("load_documents")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .select("path")
  if (error) {
    return { error: error.message }
  }
  if (!data.length) {
    return { error: "That document doesn't exist anymore." }
  }
  // The row is what counts; a file left behind is only clutter.
  await supabase.storage
    .from("load-documents")
    .remove(data.map((row) => row.path))
    .catch(() => {})
  refresh()
  return { ok: true }
}

/** A receipt path must be a file in this load's folder. */
function receiptInFolder(
  organizationId: string,
  loadId: string,
  receipt: ExpenseReceipt | null | undefined
) {
  return (
    !receipt ||
    (receipt.path.startsWith(`${organizationId}/${loadId}/`) &&
      !receipt.path.includes(".."))
  )
}

/** Adds a trip expense, with its receipt if one was uploaded. */
export async function addLoadExpense(
  organizationId: string,
  loadId: string,
  input: ExpenseValues,
  receipt: ExpenseReceipt | null
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  const parsed = expenseSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the expense." }
  }
  if (!receiptInFolder(organizationId, loadId, receipt)) {
    return { error: "That receipt isn't on this load." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("load_expenses").insert({
    ...parsed.data,
    organization_id: organizationId,
    load_id: loadId,
    receipt_path: receipt?.path ?? null,
    receipt_name: receipt?.name ?? null,
    receipt_type: receipt?.type ?? null,
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

/**
 * Changes an expense. `receipt` is a new receipt, null to remove the one
 * it has, or undefined to keep it. A replaced or removed file is deleted.
 */
export async function updateLoadExpense(
  organizationId: string,
  expenseId: string,
  input: ExpenseValues,
  receipt: ExpenseReceipt | null | undefined
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  const parsed = expenseSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the expense." }
  }

  const supabase = await createClient()
  const { data: current } = await supabase
    .from("load_expenses")
    .select("load_id, receipt_path")
    .eq("organization_id", organizationId)
    .eq("id", expenseId)
    .maybeSingle()
  if (!current) {
    return { error: "That expense doesn't exist anymore." }
  }
  if (!receiptInFolder(organizationId, current.load_id, receipt)) {
    return { error: "That receipt isn't on this load." }
  }

  const { error } = await supabase
    .from("load_expenses")
    .update({
      ...parsed.data,
      ...(receipt === undefined
        ? {}
        : {
            receipt_path: receipt?.path ?? null,
            receipt_name: receipt?.name ?? null,
            receipt_type: receipt?.type ?? null,
          }),
    })
    .eq("organization_id", organizationId)
    .eq("id", expenseId)
  if (error) {
    return { error: error.message }
  }
  if (receipt !== undefined && current.receipt_path) {
    await supabase.storage
      .from("load-documents")
      .remove([current.receipt_path])
      .catch(() => {})
  }
  refresh()
  return { ok: true }
}

/** Removes an expense and its receipt file. */
export async function removeLoadExpense(
  organizationId: string,
  expenseId: string
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("load_expenses")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", expenseId)
    .select("receipt_path")
  if (error) {
    return { error: error.message }
  }
  if (!data.length) {
    return { error: "That expense doesn't exist anymore." }
  }
  const paths = data
    .map((row) => row.receipt_path)
    .filter((path): path is string => !!path)
  if (paths.length) {
    await supabase.storage
      .from("load-documents")
      .remove(paths)
      .catch(() => {})
  }
  refresh()
  return { ok: true }
}

/**
 * Someone in the office enters an arrival or departure the driver didn't
 * record, with the reason. Logged to the load's history.
 */
export async function setStopTime(
  organizationId: string,
  stopId: string,
  event: "arrived" | "departed",
  at: string,
  reason: string
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  if (event !== "arrived" && event !== "departed") {
    return { error: "Unknown stop event." }
  }
  const time = new Date(at)
  if (Number.isNaN(time.getTime())) {
    return { error: "Enter the date and time." }
  }
  if (!reason.trim()) {
    return {
      error: 'Say why you\'re entering the time, e.g. "Driver called it in".',
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("set_stop_time", {
    target_stop: stopId,
    event,
    at_time: time.toISOString(),
    reason: reason.trim(),
  })
  if (error) {
    return { error: rpcError(error) }
  }
  refresh()
  return { ok: true }
}

export type SaveAssignmentResult =
  | { error: string }
  | {
      ok: true
      /** The driver notified, by name, if anyone was. */
      notified?: string
      /** The driver taken off, by name, if anyone was. */
      removed?: string
      /** Problems telling either driver, to show as warnings. */
      problems: string[]
    }

/**
 * Saves the truck, driver and miles. When that leaves the load with a truck
 * and driver who haven't been sent it, the driver is notified with their
 * link; a driver taken off is told the load was removed and their link
 * stops working. Nothing is sent except from this save.
 */
export async function saveAssignment(
  organizationId: string,
  loadId: string,
  input: LoadAssignmentValues
): Promise<SaveAssignmentResult> {
  const organization = (await getMyOrganizations()).find(
    (org) => org.id === organizationId
  )
  if (!organization) {
    return { error: "You aren't a member of this organization." }
  }
  const parsed = loadAssignmentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc("assign_load", {
      target_load: loadId,
      new_truck: parsed.data.truck_id,
      new_driver: parsed.data.driver_id,
      new_miles: parsed.data.miles,
      new_empty_miles: parsed.data.empty_miles,
    })
    .single<{
      removed_email: string | null
      removed_name: string | null
      token: string | null
      email_to: string | null
      driver_name: string | null
    }>()
  if (error) {
    return {
      error: error.code === "23503" ? DRIVER_NOT_FOUND : rpcError(error),
    }
  }

  const problems: string[] = []
  const needsLoad = data.removed_name || data.token
  const { data: load } = needsLoad
    ? await supabase.from("loads").select("reference").eq("id", loadId).single()
    : { data: null }
  const reference = load?.reference ?? ""

  // Tell the driver who was taken off.
  if (data.removed_name) {
    if (data.removed_email) {
      const problem = await sendUnassignedEmail({
        to: data.removed_email,
        driverName: data.removed_name,
        organizationName: organization.name,
        reference,
      })
      if (problem) {
        problems.push(
          `The email telling ${data.removed_name} didn't send: ${problem}`
        )
      }
    } else {
      problems.push(
        `${data.removed_name} has no email address, so let them know the load was removed.`
      )
    }
  }

  // Notify the new driver with their link.
  if (data.token && data.driver_name) {
    let failed = false
    if (data.email_to) {
      const { data: stops } = await supabase
        .from("load_stops")
        .select("kind, location, appointment_start, appointment_end")
        .eq("load_id", loadId)
        .order("position")
      const problem = await sendDispatchEmail({
        to: data.email_to,
        driverName: data.driver_name,
        organizationName: organization.name,
        reference,
        stops: (stops ?? []).map((stop) => ({
          kind: stop.kind as "pickup" | "delivery",
          location: stop.location,
          when: formatStopWindow(stop.appointment_start, stop.appointment_end),
        })),
        link: `${await appUrl()}/dispatch/${data.token}`,
        resent: false,
      })
      if (problem) {
        failed = true
        problems.push(
          `The email to ${data.driver_name} didn't send: ${problem}`
        )
      }
    } else {
      failed = true
      problems.push(
        `${data.driver_name} has no email address. Copy their link and send it another way.`
      )
    }
    if (failed) {
      await supabase
        .rpc("record_dispatch_email", { target_load: loadId, failed: true })
        .then(
          () => {},
          () => {}
        )
    }
  }

  refresh()
  return {
    ok: true,
    notified: data.driver_name ?? undefined,
    removed: data.removed_name ?? undefined,
    problems,
  }
}

export type AssignmentConflicts = {
  driver: { id: string; reference: string }[]
  truck: { id: string; reference: string }[]
}

/**
 * This company's other loads on the schedule at the same time as this one,
 * for the chosen truck and driver. Read only: for a warning before saving.
 */
export async function checkAssignmentConflicts(
  organizationId: string,
  loadId: string,
  truckId: string | null,
  driverId: string | null
): Promise<AssignmentConflicts> {
  const empty = { driver: [], truck: [] }
  if (!(await isMember(organizationId)) || (!truckId && !driverId)) {
    return empty
  }
  const supabase = await createClient()
  const { data } = await supabase.rpc("assignment_conflicts", {
    target_load: loadId,
    for_truck: truckId,
    for_driver: driverId,
  })
  return (data as AssignmentConflicts | null) ?? empty
}
