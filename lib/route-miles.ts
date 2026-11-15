// Driving miles between a load's stops, from the Google Maps Routes API.
// Server only: it needs GOOGLE_MAPS_API_KEY, which must never be
// NEXT_PUBLIC_. Only the stop addresses are sent.
//
// Routes are for a car, not a truck: Google doesn't take truck size or
// hazmat into account, so a truck route can run a little longer.

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes"
const METERS_PER_MILE = 1609.344
/** The Routes API takes up to 25 stops between the first and the last. */
export const MAX_ROUTE_STOPS = 27

export type RouteMiles =
  { ok: true; miles: number; hours: number } | { ok: false; error: string }

type RoutesResponse = {
  routes?: { distanceMeters?: number; duration?: string }[]
  error?: { message?: string; status?: string }
}

/** Driving miles from the first address to the last, through the others in order. */
export async function routeMiles(addresses: string[]): Promise<RouteMiles> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) {
    return {
      ok: false,
      error:
        "Miles from Google Maps aren't set up yet. Add GOOGLE_MAPS_API_KEY to the server.",
    }
  }
  const stops = addresses.map((address) => address.trim())
  if (stops.length < 2 || stops.some((address) => !address)) {
    return { ok: false, error: "Fill in every stop's address first." }
  }
  if (stops.length > MAX_ROUTE_STOPS) {
    return {
      ok: false,
      error: `Google Maps can route up to ${MAX_ROUTE_STOPS} stops. Enter the miles yourself.`,
    }
  }

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { address: stops[0] },
        destination: { address: stops.at(-1) },
        intermediates: stops.slice(1, -1).map((address) => ({ address })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        units: "IMPERIAL",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return { ok: false, error: "Couldn't reach Google Maps. Try again." }
  }

  const body = (await response.json().catch(() => ({}))) as RoutesResponse
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      error:
        "Google Maps rejected the API key. Check GOOGLE_MAPS_API_KEY, and that the Routes API is turned on for it.",
    }
  }
  if (!response.ok) {
    return {
      ok: false,
      error:
        response.status === 400
          ? "Google Maps couldn't find one of the addresses. Check them, or enter the miles yourself."
          : `Google Maps didn't answer (${response.status}). Try again.`,
    }
  }

  const route = body.routes?.[0]
  // Google leaves distanceMeters out when it's 0 (the same place), so only
  // a missing route means there's no way to drive it.
  if (!route) {
    return {
      ok: false,
      error:
        "Google Maps found no driving route between these stops. Check the addresses.",
    }
  }
  const seconds = Number(route.duration?.replace(/s$/, "") ?? 0)
  return {
    ok: true,
    miles: Math.round((route.distanceMeters ?? 0) / METERS_PER_MILE),
    hours: Math.round((seconds / 3600) * 10) / 10,
  }
}
