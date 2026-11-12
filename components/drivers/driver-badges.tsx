import { cn } from "cn"
import { AlertTriangle, Clock } from "lucide-react"

import {
  formatDate,
  needsAction,
  type ComplianceItem,
} from "@/lib/driver-format"
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
          ? "text-emerald-700 dark:text-emerald-300"
          : "bg-muted text-muted-foreground",
        className
      )}
    >
      {DRIVER_STATUS_LABELS[status]}
    </span>
  )
}

const TONES = {
  expired: "bg-destructive/10 text-destructive",
  urgent: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  soon: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  upcoming: "bg-muted text-foreground",
}

function inDays(days: number) {
  return days === 0 ? "today" : `in ${days} ${days === 1 ? "day" : "days"}`
}

/**
 * A warning when an item is late or due within 60 days, or nothing. With
 * `showLabel` the badge names the item, e.g. "CDL expires in 9 days".
 */
export function ExpiryBadge({
  item,
  showLabel = false,
}: {
  item: ComplianceItem
  showLabel?: boolean
}) {
  const { expiry, kind, label } = item
  if (expiry.state === "missing" || !needsAction(expiry.state) || !item.due) {
    return null
  }
  const late = expiry.state === "expired"
  const verb = late
    ? kind === "expires"
      ? "expired"
      : "overdue"
    : kind === "expires"
      ? "expires"
      : "due"
  const text = late ? verb : `${verb} ${inDays(expiry.days)}`
  const full = `${label} ${text}`
  return (
    <span
      className={cn(pill, TONES[expiry.state])}
      title={`${label} ${
        kind === "expires"
          ? late
            ? "expired"
            : "expires"
          : late
            ? "was due"
            : "due"
      } ${formatDate(item.due)}`}
    >
      {late ? <AlertTriangle aria-hidden /> : <Clock aria-hidden />}
      {showLabel ? full : text.charAt(0).toUpperCase() + text.slice(1)}
    </span>
  )
}

/** The due date with its warning badge, or "Not set". */
export function ExpiryDate({
  item,
  warn = true,
}: {
  item: ComplianceItem
  /** Inactive drivers aren't driving, so their dates don't need warnings. */
  warn?: boolean
}) {
  if (!item.due) {
    return <span className="text-muted-foreground">Not set</span>
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{formatDate(item.due)}</span>
      {warn && <ExpiryBadge item={item} />}
    </span>
  )
}
