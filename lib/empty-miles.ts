// Estimated empty (deadhead) miles: from where the truck will be before a
// load to that load's first pickup. Server only, since it routes through
// Google Maps (lib/route-miles).
//
// Where the truck will be: the delivery of its last load before this one,
// or the truck's home base when it has no earlier load. The real number
// comes later from the ELD (see docs/eld-integration.md).

import { routeMiles } from "@/lib/route-miles"
import { createClient } from "@/lib/supabase/server"

export type EmptyMilesEstimate =
  | {
      ok: true
      miles: number
      /** Where the empty miles start, e.g. "Atlanta, GA". */
      from: string
      /** The load whose delivery they start from, or null for home base. */
      afterLoad: string | null
    }
  | {
      ok: false
      error: string
      /** Nothing to start from: no earlier load and no home base. */
      noOrigin?: boolean
    }

export async function estimateEmptyMiles({
  organizationId,
  truckId,
  pickupLocation,
  pickupStart,
  excludeLoadId,
}: {
  organizationId: string
  truckId: string
  /** The load's first pickup address. */
  pickupLocation: string
  /** Wall-clock time of the first pickup, "YYYY-MM-DDTHH:mm"; now if unknown. */
  pickupStart: string | null
  /** The load itself, when it's already saved. */
  excludeLoadId?: string
}): Promise<EmptyMilesEstimate> {
  if (!pickupLocation.trim()) {
    return { ok: false, error: "Add the first pickup's address first." }
  }
  const supabase = await createClient()

  // The truck's last delivery at or before this pickup.
  const before =
    pickupStart && /^\d{4}-\d{2}-\d{2}T/.test(pickupStart)
      ? pickupStart.slice(0, 16)
      : new Date().toISOString().slice(0, 16)
  let query = supabase
    .from("loads")
    .select("reference, delivery_location, delivery_start")
    .eq("organization_id", organizationId)
    .eq("truck_id", truckId)
    .not("status", "in", "(cancelled,tonu)")
    .lte("delivery_start", before)
    .order("delivery_start", { ascending: false })
    .limit(1)
  if (excludeLoadId) query = query.neq("id", excludeLoadId)
  const { data: previous } = await query.maybeSingle()

  let origin: string | null = previous?.delivery_location ?? null
  let afterLoad: string | null = previous?.reference ?? null
  if (!origin) {
    const { data: truck } = await supabase
      .from("trucks")
      .select("home_base")
      .eq("organization_id", organizationId)
      .eq("id", truckId)
      .maybeSingle()
    origin = truck?.home_base ?? null
    afterLoad = null
  }
  if (!origin) {
    return {
      ok: false,
      noOrigin: true,
      error: "This truck has no earlier load and no home base to start from.",
    }
  }

  // Already there: no empty miles.
  if (origin.trim().toLowerCase() === pickupLocation.trim().toLowerCase()) {
    return { ok: true, miles: 0, from: shortPlace(origin), afterLoad }
  }
  const route = await routeMiles([origin, pickupLocation])
  if (!route.ok) {
    // Say where from, so a bad address on the earlier load can be fixed.
    const where = afterLoad
      ? `load ${afterLoad}'s delivery (${origin})`
      : `the truck's home base (${origin})`
    return {
      ok: false,
      error: `Couldn't route from ${where} to the first pickup.`,
    }
  }
  return { ok: true, miles: route.miles, from: shortPlace(origin), afterLoad }
}

/** "Kroger DC, 2500 Main St, Dallas, TX 75201" → "Dallas, TX" */
function shortPlace(address: string) {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  // "…, City, ST 12345" or "…, City, ST"
  const last = parts.at(-1) ?? ""
  const state = last.match(/^([A-Z]{2})(\s+\d{5}(-\d{4})?)?$/)
  if (state && parts.length >= 2) return `${parts.at(-2)}, ${state[1]}`
  return parts.slice(-2).join(", ") || address
}
