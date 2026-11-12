import { cn } from "cn"
import { AlertTriangle, Clock } from "lucide-react"

import { expiry, formatDate } from "@/lib/driver-format"
import { DRIVER_STATUS_LABELS, type DriverStatus } from "@/lib/schemas/driver"

const pill =
  "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-4xl px-2.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3"

export function DriverStatusBadge({
  status,
  className,
}: {
  status: DriverStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        pill,
        status === "active"
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "bg-muted text-muted-foreground",
        className
      )}
    >
      {DRIVER_STATUS_LABELS[status]}
    </span>
  )
}

/**
 * A warning when `date` has passed or is within 30 days, or nothing.
 * `label` names the document for screen readers, e.g. "CDL".
 */
export function ExpiryBadge({
  date,
  today,
  label,
  showLabel = false,
}: {
  date: string | null
  today: string
  label: string
  /** Put the document's name in the badge, e.g. "CDL expired". */
  showLabel?: boolean
}) {
  const state = expiry(date, today)
  const prefix = showLabel ? `${label} ` : ""
  if (state.state === "expired") {
    return (
      <span
        className={cn(pill, "bg-destructive/10 text-destructive")}
        title={`${label} expired ${formatDate(date!)}`}
      >
        <AlertTriangle aria-hidden />
        {prefix}
        {showLabel ? "expired" : "Expired"}
      </span>
    )
  }
  if (state.state === "soon") {
    return (
      <span
        className={cn(
          pill,
          "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        )}
        title={`${label} expires ${formatDate(date!)}`}
      >
        <Clock aria-hidden />
        {prefix}
        {showLabel ? "expires" : "Expires"}
        {state.days === 0
          ? " today"
          : ` in ${state.days} ${state.days === 1 ? "day" : "days"}`}
      </span>
    )
  }
  return null
}

/** The expiration date with its warning badge, or "Not set". */
export function ExpiryDate({
  date,
  today,
  label,
  warn = true,
}: {
  date: string | null
  today: string
  label: string
  /** Inactive drivers aren't driving, so their dates don't need warnings. */
  warn?: boolean
}) {
  if (!date) {
    return <span className="text-muted-foreground">Not set</span>
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{formatDate(date)}</span>
      {warn && <ExpiryBadge date={date} today={today} label={label} />}
    </span>
  )
}
