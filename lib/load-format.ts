import type { AppointmentType, LoadStatus } from "@/lib/schemas/load"

// Stop times are wall-clock times with no zone, so they're read and printed
// as UTC: the server render and the browser then agree on the same text.
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})
const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
})
const dayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})
const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
})

function wallClock(value: string) {
  return new Date(`${value.slice(0, 19)}Z`)
}

/** "Nov 14" */
export function formatStopDate(value: string) {
  return dateFormat.format(wallClock(value))
}

/** "Fri, Nov 14, 2026, 8:00 AM – 11:00 AM", or with a date on both ends when the window spans days. */
export function formatStopWindow(
  start: string,
  end: string | null,
  /** A stop to be scheduled shows its date with "appointment TBD". */
  type?: AppointmentType | null
) {
  if (type === "tbd") {
    return `${dayFormat.format(wallClock(start))} · appointment TBD`
  }
  const from = dateTimeFormat.format(wallClock(start))
  if (!end) {
    return from
  }
  const to =
    end.slice(0, 10) === start.slice(0, 10)
      ? timeFormat.format(wallClock(end))
      : dateTimeFormat.format(wallClock(end))
  return `${from} – ${to}`
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

export function formatRate(rate: number | string) {
  return usd.format(Number(rate))
}

/** Tints for each status's badge. */
export const STATUS_STYLES: Record<LoadStatus, string> = {
  booked: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  dispatched: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  loaded: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  delivered: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  invoiced: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  paid: "bg-green-600/15 text-green-800 dark:text-green-300",
  factored: "bg-teal-500/15 text-teal-800 dark:text-teal-300",
  cancelled: "bg-muted text-muted-foreground",
  tonu: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
}

/** "2h 15m", "45m" */
export function formatDuration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60000))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}m`
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

/**
 * Detention at a stop: time on site past the free hours, billed in quarter
 * hours. Counted from arrival, since the appointment is a wall-clock time
 * with no zone; check the driver arrived on time before billing it. Null
 * until the driver has arrived and departed, or with no detention terms.
 */
export function stopDetention(
  stop: { arrived_at: string | null; departed_at: string | null },
  terms: { detention_free_hours: number | null; detention_rate: number | null }
) {
  if (!stop.arrived_at || !stop.departed_at) return null
  const onSite =
    new Date(stop.departed_at).getTime() - new Date(stop.arrived_at).getTime()
  if (terms.detention_free_hours === null || terms.detention_rate === null) {
    return { onSite, billableHours: 0, amount: 0 }
  }
  const pastFree = onSite / 3_600_000 - Number(terms.detention_free_hours)
  const billableHours = pastFree > 0 ? Math.ceil(pastFree * 4) / 4 : 0
  return {
    onSite,
    billableHours,
    amount:
      Math.round(billableHours * Number(terms.detention_rate) * 100) / 100,
  }
}

// ------------------------------------------------------------- Odometer ----

type OdometerStop = {
  position: number
  kind: "pickup" | "delivery"
  arrived_odometer?: number | null
  departed_odometer?: number | null
}

/**
 * Where the driver is asked for the odometer: arriving at the first pickup
 * and leaving the last stop. Two readings give the load's loaded miles; the
 * last one keeps the truck's odometer current.
 */
export function odometerStops(stops: OdometerStop[]) {
  const pickups = stops.filter((stop) => stop.kind === "pickup")
  const first = pickups.length
    ? Math.min(...pickups.map((stop) => stop.position))
    : null
  const last = stops.length
    ? Math.max(...stops.map((stop) => stop.position))
    : null
  return { firstPickup: first, lastStop: last }
}

/**
 * Loaded miles by the odometer: leaving the last stop less arriving at the
 * first pickup. Null until both readings are in.
 */
export function odometerMiles(stops: OdometerStop[]) {
  const { firstPickup, lastStop } = odometerStops(stops)
  const start = stops.find(
    (stop) => stop.position === firstPickup
  )?.arrived_odometer
  const end = stops.find(
    (stop) => stop.position === lastStop
  )?.departed_odometer
  if (start == null || end == null || end < start) return null
  return end - start
}
