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

export type OdometerResult = { error: string } | { ok: true }

/**
 * The driver enters the odometer after tapping Arrived at the first pickup
 * or Departed at the last stop. Skipping it never blocks the check-in.
 */
export async function recordOdometerByToken(
  token: string,
  position: number,
  event: "arrived" | "departed",
  reading: number
): Promise<OdometerResult> {
  if (event !== "arrived" && event !== "departed") {
    return { error: "Unknown stop event." }
  }
  if (!Number.isInteger(position) || position < 1) {
    return { error: "That stop isn't on the load." }
  }
  if (!Number.isInteger(reading) || reading < 0 || reading > 5_000_000) {
    return { error: "Enter the odometer in miles." }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("record_stop_odometer_by_token", {
    link_token: token,
    stop_position: position,
    event,
    reading,
  })
  if (error) {
    return {
      error: error.hint ? error.message : "Couldn't save that. Try again.",
    }
  }
  return { ok: true }
}
