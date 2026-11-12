import type { LoadStatus } from "@/lib/schemas/load"

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
export function formatStopWindow(start: string, end: string | null) {
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
  in_transit: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  delivered: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  invoiced: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  cancelled: "bg-muted text-muted-foreground",
}
