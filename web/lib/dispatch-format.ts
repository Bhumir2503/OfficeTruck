// Shared by server and client: no server-only imports here.

/** Statuses where a load is still on a driver's schedule. */
export const SCHEDULED_STATUSES = ["booked", "dispatched", "loaded"] as const

export type LoadWindow = {
  id: string
  reference: string
  /** Wall-clock time at the first stop, "YYYY-MM-DDTHH:mm:ss". */
  pickup_start: string
  /** Wall-clock time at the last stop. */
  delivery_start: string
  delivery_end: string | null
}

/** From the first appointment to the end of the last one. */
export function windowOf(load: LoadWindow) {
  return {
    start: load.pickup_start.slice(0, 16),
    end: (load.delivery_end ?? load.delivery_start).slice(0, 16),
  }
}

/**
 * The other loads whose time on the road overlaps this one's. The strings
 * are zero-padded wall-clock times, so they compare as dates.
 */
export function overlapping(load: LoadWindow, others: LoadWindow[]) {
  const a = windowOf(load)
  return others.filter((other) => {
    if (other.id === load.id) return false
    const b = windowOf(other)
    return a.start < b.end && b.start < a.end
  })
}
