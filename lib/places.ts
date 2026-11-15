// Address suggestions for stops, from Google Places (the "Places API (New)").
// Server only: it needs GOOGLE_MAPS_API_KEY, which must never be
// NEXT_PUBLIC_. Only what's typed in the address box is sent.
//
// Suggestions and the address picked from them share a session token, so
// Google bills them together as one lookup.

const BASE = "https://places.googleapis.com/v1"

export type AddressSuggestion = {
  placeId: string
  /** "Walmart Distribution Center" or "1001 SE 5th St" */
  main: string
  /** "Bentonville, AR, USA" */
  secondary: string
  /** A business or other named place, rather than a bare street address. */
  business: boolean
}

export type PickedAddress = {
  /** The full street address, without ", USA". */
  address: string
  /** The business's name, when the place is one. */
  name: string | null
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const NOT_SET_UP =
  "Address suggestions aren't set up yet. Add GOOGLE_MAPS_API_KEY to the server."

function failure(status: number): string {
  if (status === 401 || status === 403) {
    return "Google Maps rejected the API key. Check that the Places API (New) is turned on for it."
  }
  return `Google Maps didn't answer (${status}).`
}

/** "123 Main St, Dallas, TX 75201, USA" → "123 Main St, Dallas, TX 75201" */
function trimCountry(address: string) {
  return address.replace(/,\s*(USA|United States)$/i, "").trim()
}

/** Places matching what's been typed, in the US, Canada and Mexico. */
export async function suggestAddresses(
  input: string,
  sessionToken: string
): Promise<Result<AddressSuggestion[]>> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return { ok: false, error: NOT_SET_UP }
  const text = input.trim()
  if (text.length < 3) return { ok: true, value: [] }

  try {
    const response = await fetch(`${BASE}/places:autocomplete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types",
      },
      body: JSON.stringify({
        input: text,
        sessionToken,
        includedRegionCodes: ["us", "ca", "mx"],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) return { ok: false, error: failure(response.status) }
    const body = (await response.json()) as {
      suggestions?: {
        placePrediction?: {
          placeId?: string
          types?: string[]
          structuredFormat?: {
            mainText?: { text?: string }
            secondaryText?: { text?: string }
          }
        }
      }[]
    }
    const value = (body.suggestions ?? [])
      .map((suggestion) => suggestion.placePrediction)
      .filter((place) => place?.placeId && place.structuredFormat?.mainText)
      .slice(0, 5)
      .map((place) => ({
        placeId: place!.placeId!,
        main: place!.structuredFormat!.mainText!.text ?? "",
        secondary: trimCountry(
          place!.structuredFormat?.secondaryText?.text ?? ""
        ),
        business: (place!.types ?? []).includes("establishment"),
      }))
    return { ok: true, value }
  } catch {
    return { ok: false, error: "Couldn't reach Google Maps." }
  }
}

/** The full address (and business name) of a suggestion that was picked. */
export async function pickAddress(
  placeId: string,
  sessionToken: string
): Promise<Result<PickedAddress>> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return { ok: false, error: NOT_SET_UP }
  if (!/^[A-Za-z0-9_-]{1,300}$/.test(placeId)) {
    return { ok: false, error: "That address can't be looked up." }
  }

  try {
    const response = await fetch(
      `${BASE}/places/${placeId}?sessionToken=${encodeURIComponent(sessionToken)}`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "formattedAddress,displayName,types",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      }
    )
    if (!response.ok) return { ok: false, error: failure(response.status) }
    const place = (await response.json()) as {
      formattedAddress?: string
      displayName?: { text?: string }
      types?: string[]
    }
    if (!place.formattedAddress) {
      return { ok: false, error: "Google Maps has no address for that place." }
    }
    const business = (place.types ?? []).includes("establishment")
    return {
      ok: true,
      value: {
        address: trimCountry(place.formattedAddress).slice(0, 200),
        name: business
          ? (place.displayName?.text?.slice(0, 120) ?? null)
          : null,
      },
    }
  } catch {
    return { ok: false, error: "Couldn't reach Google Maps." }
  }
}
