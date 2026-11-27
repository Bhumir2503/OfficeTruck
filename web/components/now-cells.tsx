import Link from "next/link"

import {
  formatDate as formatDay,
  LAST_DELIVERY_DAYS,
} from "@/lib/driver-format"
import type { DriverLastDelivery, DriverNow } from "@/lib/drivers"
import { formatStopDate, STATUS_STYLES } from "@/lib/load-format"
import { LOAD_STATUS_LABELS } from "@/lib/schemas/load"

/*
 * The Now and Last delivery cells of the drivers and trucks lists. Their
 * links sit above the row's own link, which covers the whole row.
 */

/**
 * What a driver or truck is doing now: the load it's on, or Available with
 * the next booked load.
 */
export function NowCell({
  off,
  now,
  loadsBase,
}: {
  /** Inactive (or parked): no load to show. */
  off: boolean
  now: DriverNow | undefined
  loadsBase: string
}) {
  if (off) {
    return <span className="text-sm text-muted-foreground">—</span>
  }
  const current = now?.current
  if (current) {
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link
            href={`${loadsBase}/${current.id}`}
            className="relative z-10 font-medium tabular-nums hover:underline"
          >
            {current.reference}
          </Link>
          <span
            className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[current.status]}`}
          >
            {LOAD_STATUS_LABELS[current.status]}
          </span>
        </div>
        <div className="truncate text-sm text-muted-foreground">
          {current.from} → {current.to}
        </div>
      </div>
    )
  }
  const next = now?.next
  const parked = now?.parked
  return (
    <div className="min-w-0">
      {parked ? (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-300">
          <span className="size-1.5 rounded-full bg-amber-500" />
          Truck {parked.unit} in the shop
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Available
        </span>
      )}
      {parked && !next && (
        <div className="truncate text-sm text-muted-foreground">
          {parked.until
            ? `Out of service until ${formatDay(parked.until)}`
            : "Out of service"}
        </div>
      )}
      {next && (
        <div className="truncate text-sm text-muted-foreground">
          Next:{" "}
          <Link
            href={`${loadsBase}/${next.id}`}
            className="relative z-10 tabular-nums hover:underline"
          >
            {next.reference}
          </Link>{" "}
          · picks up {formatStopDate(next.pickup_start)}
        </div>
      )}
    </div>
  )
}

/**
 * On a phone, where the Now column is hidden: what the driver or truck is
 * doing, in one line under its name. Plain text; the row opens it.
 */
export function NowLine({
  off,
  now,
}: {
  off: boolean
  now: DriverNow | undefined
}) {
  if (off) return null
  const current = now?.current
  if (current) {
    return (
      <div className="mt-1 truncate text-xs md:hidden">
        <span
          className={`mr-1.5 rounded-md px-1.5 py-0.5 font-medium ${STATUS_STYLES[current.status]}`}
        >
          {LOAD_STATUS_LABELS[current.status]}
        </span>
        <span className="text-muted-foreground">
          {current.from} → {current.to}
        </span>
      </div>
    )
  }
  return (
    <div className="mt-1 truncate text-xs md:hidden">
      {now?.parked ? (
        <span className="font-medium text-amber-700 dark:text-amber-300">
          Truck {now.parked.unit} in the shop
        </span>
      ) : (
        <span className="font-medium text-emerald-700 dark:text-emerald-300">
          Available
        </span>
      )}
      {now?.next && (
        <span className="text-muted-foreground">
          {" "}
          · next picks up {formatStopDate(now.next.pickup_start)}
        </span>
      )}
    </div>
  )
}

/** Whole days from one "YYYY-MM-DD" date to another. */
function daysBetween(from: string, to: string) {
  const day = (value: string) => Date.parse(`${value.slice(0, 10)}T00:00:00Z`)
  return Math.round((day(to) - day(from)) / 86_400_000)
}

/** When and where a driver or truck last delivered, and how long ago. */
export function LastDeliveryCell({
  last,
  today,
  loadsBase,
}: {
  last: DriverLastDelivery | null
  /** "YYYY-MM-DD" */
  today: string
  loadsBase: string
}) {
  if (!last) {
    return (
      <span className="text-sm text-muted-foreground">
        None in {LAST_DELIVERY_DAYS} days
      </span>
    )
  }
  const days = Math.max(0, daysBetween(last.delivered_on, today))
  const ago =
    days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`
  return (
    <div className="min-w-0">
      <Link
        href={`${loadsBase}/${last.id}`}
        title={`Load ${last.reference}`}
        className="relative z-10 text-sm font-medium hover:underline"
      >
        {ago}
      </Link>
      <div className="truncate text-sm text-muted-foreground">
        {formatStopDate(`${last.delivered_on}T00:00`)} · {last.to}
      </div>
    </div>
  )
}
