"use server"

import { createClient } from "@/lib/supabase/server"

export type StopEventResult = { error: string } | { ok: true; at: string }

/** The driver taps Arrived or Departed at a stop from their link. */
export async function recordStopByToken(
  token: string,
  position: number,
  event: "arrived" | "departed"
): Promise<StopEventResult> {
  if (event !== "arrived" && event !== "departed") {
    return { error: "Unknown stop event." }
  }
  if (!Number.isInteger(position) || position < 1) {
    return { error: "That stop isn't on the load." }
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("record_stop_event_by_token", {
    link_token: token,
    stop_position: position,
    event,
  })
  if (error) {
    return {
      error: error.hint ? error.message : "Couldn't save that. Try again.",
    }
  }
  return { ok: true, at: data as string }
}
