import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  brokerUpdateMessage,
  type BrokerUpdateEvent,
  type BrokerUpdateMessage,
  type BrokerUpdateStop,
  updateHistoryDetail,
  updateRecipients,
} from "@/lib/broker-update-format"
import { sendBrokerUpdateEmail } from "@/lib/email/broker-update-email"

// Sends the status updates the database queued (see the broker_updates
// migration): one email per update, recorded on the load's history. Runs
// with the secret key, from /api/cron/broker-updates.

/** Updates older than this aren't news any more; they're dropped. */
const FRESH_HOURS = 48
const MAX_ATTEMPTS = 5
const BATCH = 25

const STOP_COLUMNS =
  "id, position, kind, facility, location, time_zone, appointment_at, stop_number, arrived_at, departed_at, arrived_source, departed_source, arrived_latitude, arrived_longitude, arrived_location_accuracy_m, departed_latitude, departed_longitude, departed_location_accuracy_m"

type Queued = {
  id: string
  organization_id: string
  load_id: string
  stop_id: string | null
  event: BrokerUpdateEvent
  created_at: string
  attempts: number
}

export type BrokerUpdateResult = {
  id: string
  load: string
  to: string[]
  message?: BrokerUpdateMessage
  sent: boolean
  error?: string
}

/**
 * Sends what's queued, oldest first. With `dryRun`, builds the messages and
 * returns them without sending or marking anything.
 */
export async function sendQueuedBrokerUpdates(
  admin: SupabaseClient,
  { dryRun = false }: { dryRun?: boolean } = {}
): Promise<BrokerUpdateResult[]> {
  const since = new Date(Date.now() - FRESH_HOURS * 3_600_000).toISOString()
  const { data: queued, error } = await admin
    .from("broker_updates")
    .select(
      "id, organization_id, load_id, stop_id, event, created_at, attempts"
    )
    .is("sent_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .gt("created_at", since)
    .order("created_at")
    .limit(BATCH)
  if (error) throw error

  const results: BrokerUpdateResult[] = []
  for (const update of (queued ?? []) as Queued[]) {
    results.push(await sendOne(admin, update, dryRun))
  }
  return results
}

async function sendOne(
  admin: SupabaseClient,
  update: Queued,
  dryRun: boolean
): Promise<BrokerUpdateResult> {
  const [{ data: load }, { data: organization }, { data: stops }] =
    await Promise.all([
      admin
        .from("loads")
        .select(
          "id, reference, broker_id, rate_con_from, detention_free_hours, detention_rate"
        )
        .eq("id", update.load_id)
        .maybeSingle(),
      admin
        .from("organizations")
        .select("name, email, time_zone")
        .eq("id", update.organization_id)
        .maybeSingle(),
      admin
        .from("load_stops")
        .select(STOP_COLUMNS)
        .eq("load_id", update.load_id)
        .order("position"),
    ])
  if (!load || !organization) {
    return fail(admin, update, "?", "The load is gone.", dryRun)
  }

  const { data: contacts } = load.broker_id
    ? await admin
        .from("broker_contacts")
        .select("role, email")
        .eq("broker_id", load.broker_id)
    : { data: [] }
  const to = updateRecipients(contacts ?? [], load.rate_con_from)
  if (!to.length) {
    return fail(
      admin,
      update,
      load.reference,
      "No dispatch contact with an email, and no rate con sender.",
      dryRun,
      true
    )
  }

  const list = (stops ?? []) as (BrokerUpdateStop & { id: string })[]
  const stop =
    update.event === "delivered"
      ? (list.at(-1) ?? null)
      : (list.find((item) => item.id === update.stop_id) ?? null)
  // A detention notice is moot once the driver has left: the charge
  // covers it.
  const detention =
    update.event === "detention_soon" || update.event === "detention_started"
  if (detention && (!stop?.arrived_at || stop.departed_at)) {
    return fail(
      admin,
      update,
      load.reference,
      "The driver left before it went out.",
      dryRun,
      true
    )
  }
  const message = brokerUpdateMessage({
    companyName: organization.name,
    timeZone: organization.time_zone ?? "America/Chicago",
    reference: load.reference,
    event: update.event,
    stop,
    stopCount: list.length,
    at: update.created_at,
    detention:
      load.detention_free_hours === null
        ? null
        : {
            freeHours: Number(load.detention_free_hours),
            rate:
              load.detention_rate === null ? null : Number(load.detention_rate),
          },
  })
  if (dryRun) {
    return { id: update.id, load: load.reference, to, message, sent: false }
  }

  const sendError = await sendBrokerUpdateEmail({
    to,
    replyTo: organization.email,
    companyName: organization.name,
    message,
  })
  if (sendError) {
    return fail(admin, update, load.reference, sendError, dryRun)
  }
  await admin
    .from("broker_updates")
    .update({
      sent_at: new Date().toISOString(),
      sent_to: to,
      last_error: null,
    })
    .eq("id", update.id)
  await admin.from("load_events").insert({
    organization_id: update.organization_id,
    load_id: update.load_id,
    kind: "broker_update",
    detail: updateHistoryDetail(message.subject, to),
  })
  return { id: update.id, load: load.reference, to, sent: true }
}

/** Notes why it didn't go; `final` stops it being tried again. */
async function fail(
  admin: SupabaseClient,
  update: Queued,
  reference: string,
  reason: string,
  dryRun: boolean,
  final = false
): Promise<BrokerUpdateResult> {
  if (!dryRun) {
    await admin
      .from("broker_updates")
      .update({
        attempts: final ? MAX_ATTEMPTS : update.attempts + 1,
        last_error: reason,
      })
      .eq("id", update.id)
  }
  return { id: update.id, load: reference, to: [], sent: false, error: reason }
}
