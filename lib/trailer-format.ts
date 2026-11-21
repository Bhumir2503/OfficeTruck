import { TRAILER_TYPE_LABELS } from "@/lib/schemas/trailer"
import type { Trailer } from "@/lib/trailers"

/** "53 ft Reefer · 2019 Utility", or whatever parts are on file. */
export function trailerDescription(
  trailer: Pick<Trailer, "length_ft" | "trailer_type" | "year" | "make">
) {
  const kind = [
    trailer.length_ft && `${trailer.length_ft} ft`,
    trailer.trailer_type && TRAILER_TYPE_LABELS[trailer.trailer_type],
  ]
    .filter(Boolean)
    .join(" ")
  const made = [trailer.year, trailer.make].filter(Boolean).join(" ")
  return [kind, made].filter(Boolean).join(" · ")
}
