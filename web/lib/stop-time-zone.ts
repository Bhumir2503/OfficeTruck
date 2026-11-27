// The time zone of a stop's address, from Google Maps: the Geocoding API
// finds the place, the Time Zone API says which zone it's in. Server only:
// it needs GOOGLE_MAPS_API_KEY, which must never be NEXT_PUBLIC_. Only the
// address is sent.
//
// A stop's appointment is a time as written, with no zone. The zone turns
// it into a moment, so detention can start at the appointment when the
// driver is early. Appointments are still shown as written.

import type { SupabaseClient } from "@supabase/supabase-js"

const GEOCODE = "https://maps.googleapis.com/maps/api/geocode/json"
const TIME_ZONE = "https://maps.googleapis.com/maps/api/timezone/json"

type GeocodeResponse = {
  status?: string
  results?: { geometry?: { location?: { lat?: number; lng?: number } } }[]
}
type TimeZoneResponse = { status?: string; timeZoneId?: string }

async function ask<T>(url: string, params: Record<string, string>) {
  const response = await fetch(`${url}?${new URLSearchParams(params)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  })
  return (await response.json()) as T
}

/**
 * The IANA zone of an address, like "America/New_York". Null when there's
 * no API key, or Google can't place it: the stop then counts detention
 * from arrival.
 */
export async function addressTimeZone(address: string): Promise<string | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key || !address.trim()) return null
  try {
    const geocode = await ask<GeocodeResponse>(GEOCODE, {
      address: address.trim(),
      region: "us",
      key,
    })
    const point = geocode.results?.[0]?.geometry?.location
    if (
      geocode.status !== "OK" ||
      typeof point?.lat !== "number" ||
      typeof point?.lng !== "number"
    ) {
      return null
    }
    const zone = await ask<TimeZoneResponse>(TIME_ZONE, {
      location: `${point.lat},${point.lng}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      key,
    })
    return zone.status === "OK" && zone.timeZoneId ? zone.timeZoneId : null
  } catch {
    return null
  }
}

/**
 * Looks up and saves the zone of each of a load's stops that doesn't have
 * one: new stops, and stops whose address changed. Never throws; a stop
 * that can't be placed is left without a zone.
 */
export async function fillStopTimeZones(
  supabase: SupabaseClient,
  loadId: string
) {
  try {
    const { data: stops } = await supabase
      .from("load_stops")
      .select("id, location")
      .eq("load_id", loadId)
      .is("time_zone", null)
    // One lookup per address, however many stops share it.
    const zones = new Map<string, Promise<string | null>>()
    await Promise.all(
      (stops ?? []).map(async (stop) => {
        const address = String(stop.location ?? "")
        if (!zones.has(address)) zones.set(address, addressTimeZone(address))
        const zone = await zones.get(address)
        if (zone) {
          await supabase.rpc("set_stop_time_zone", {
            target_stop: stop.id,
            zone,
          })
        }
      })
    )
  } catch {
    // The load is saved either way.
  }
}
