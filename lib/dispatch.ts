import {
  overlapping,
  SCHEDULED_STATUSES,
  type LoadWindow,
} from "@/lib/dispatch-format"
import { createClient } from "@/lib/supabase/server"

export type LoadDispatch = {
  id: string
  token: string
  email_to: string | null
  include_rate: boolean
  sent_at: string
  seen_at: string | null
  accepted_at: string | null
  revoked_at: string | null
  driver: { id: string; full_name: string } | null
}

/** The load's live dispatch (the last one sent and not taken back), if any. */
export async function getLiveDispatch(
  organizationId: string,
  loadId: string
): Promise<LoadDispatch | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("load_dispatches")
    .select(
      "id, token, email_to, include_rate, sent_at, seen_at, accepted_at, revoked_at, driver:drivers (id, full_name)"
    )
    .eq("organization_id", organizationId)
    .eq("load_id", loadId)
    .is("revoked_at", null)
    .maybeSingle()
  if (error) {
    throw error
  }
  return data as unknown as LoadDispatch | null
}

export type LoadEvent = {
  id: string
  kind: "dispatched" | "resent" | "unassigned" | "reopened" | "status"
  from_status: string | null
  to_status: string | null
  detail: string | null
  created_at: string
  actor_name: string | null
}

/** A load's status history, newest first. */
export async function getLoadEvents(
  organizationId: string,
  loadId: string
): Promise<LoadEvent[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("load_events")
    .select("id, kind, from_status, to_status, detail, created_at, actor")
    .eq("organization_id", organizationId)
    .eq("load_id", loadId)
    .order("created_at", { ascending: false })
  if (error) {
    throw error
  }

  // There's no foreign key from events to profiles, so names are joined here.
  const actors = [...new Set(data.map((event) => event.actor).filter(Boolean))]
  const names = new Map<string, string | null>()
  if (actors.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", actors)
    for (const profile of profiles ?? []) {
      names.set(profile.id, profile.full_name)
    }
  }
  return data.map(({ actor, ...event }) => ({
    ...event,
    actor_name: actor ? (names.get(actor) ?? null) : null,
  })) as LoadEvent[]
}

/** A driver's loads still on their schedule, for the overlap check. */
export async function getDriverSchedule(
  organizationId: string,
  driverId: string
): Promise<LoadWindow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("loads")
    .select("id, reference, pickup_start, delivery_start, delivery_end")
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .in("status", [...SCHEDULED_STATUSES])
    .order("pickup_start")
  if (error) {
    throw error
  }
  return data as LoadWindow[]
}

/** Other scheduled loads of this driver whose times overlap this load's. */
export async function findDriverOverlaps(
  organizationId: string,
  driverId: string,
  loadId: string
) {
  const schedule = await getDriverSchedule(organizationId, driverId)
  const load = schedule.find((item) => item.id === loadId)
  return load ? overlapping(load, schedule) : []
}
