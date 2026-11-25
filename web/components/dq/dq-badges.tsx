import { cn } from "cn"
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Hourglass,
  MinusCircle,
  ShieldCheck,
} from "lucide-react"

import { AUDIT_READY, DQ_STATUS_LABELS } from "@/lib/dq-format"
import type { DqDriverStatus, DqItemStatus } from "@/lib/dq-rules"

const PILL =
  "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-4xl px-2.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3.5"

const ITEM_STYLES: Record<
  DqItemStatus,
  { className: string; icon: typeof Circle }
> = {
  complete: { className: "bg-brand/10 text-brand-ink", icon: CheckCircle2 },
  upcoming: { className: "bg-brand/10 text-brand-ink", icon: CheckCircle2 },
  due_soon: { className: "bg-amber-500/15 text-amber-800", icon: Clock },
  pending_review: { className: "bg-sky-500/15 text-sky-800", icon: Hourglass },
  overdue: {
    className: "bg-destructive/10 text-destructive",
    icon: AlertTriangle,
  },
  missing: {
    className: "bg-muted text-foreground ring-1 ring-border ring-inset",
    icon: Circle,
  },
  not_applicable: {
    className: "bg-muted text-muted-foreground",
    icon: MinusCircle,
  },
}

export function DqStatusBadge({
  status,
  className,
}: {
  status: DqItemStatus
  className?: string
}) {
  const { className: tone, icon: Icon } = ITEM_STYLES[status]
  return (
    <span className={cn(PILL, tone, className)}>
      <Icon aria-hidden />
      {DQ_STATUS_LABELS[status]}
    </span>
  )
}

/** "Audit-ready", or what's keeping the driver from it. */
export function DriverDqBadge({
  status,
  className,
}: {
  status: DqDriverStatus | null
  className?: string
}) {
  if (!status || status.status === "no_checklist") {
    return (
      <span className={cn(PILL, "bg-muted text-muted-foreground", className)}>
        Not set up
      </span>
    )
  }
  if (status.status === "audit_ready") {
    return (
      <span className={cn(PILL, "bg-brand text-white", className)}>
        <ShieldCheck aria-hidden />
        {AUDIT_READY}
      </span>
    )
  }
  const parts = [
    status.overdue && `${status.overdue} overdue`,
    status.missing && `${status.missing} missing`,
    status.pendingReview && `${status.pendingReview} to review`,
  ].filter(Boolean)
  return (
    <span
      className={cn(
        PILL,
        status.overdue
          ? "bg-destructive/10 text-destructive"
          : "bg-amber-500/15 text-amber-800",
        className
      )}
    >
      <AlertTriangle aria-hidden />
      {parts.join(" · ")}
    </span>
  )
}

/** Statuses shown by coloring the date itself rather than with a badge. */
export const DATE_STATUSES: readonly DqItemStatus[] = [
  "overdue",
  "due_soon",
  "upcoming",
]

const DATE_COLORS: Partial<Record<DqItemStatus, string>> = {
  overdue: "font-medium text-destructive",
  due_soon: "font-medium text-amber-700",
  upcoming: "text-brand",
}

/**
 * A due or expiry date, colored by the item's status: red when overdue,
 * amber when due soon, green when upcoming. The color stands in for a
 * badge, so the status is also given to screen readers.
 */
export function DueDate({
  status,
  children,
}: {
  status: DqItemStatus
  children: React.ReactNode
}) {
  const color = DATE_COLORS[status]
  if (!color) return <>{children}</>
  return (
    <span className={color}>
      {children}
      <span className="sr-only"> ({DQ_STATUS_LABELS[status]})</span>
    </span>
  )
}
