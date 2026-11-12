import { cn } from "cn"
import { Link2, Unlink } from "lucide-react"

import { TRUCK_STATUS_LABELS, type TruckStatus } from "@/lib/schemas/truck"

const pill =
  "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-4xl px-2.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3"

const STATUS_STYLES: Record<TruckStatus, string> = {
  active: "text-emerald-700 dark:text-emerald-300",
  out_of_service: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  inactive: "bg-muted text-muted-foreground",
}

export function TruckStatusBadge({
  status,
  className,
}: {
  status: TruckStatus
  className?: string
}) {
  return (
    <span className={cn(pill, STATUS_STYLES[status], className)}>
      {TRUCK_STATUS_LABELS[status]}
    </span>
  )
}

/**
 * Whether the truck is linked to its Motive vehicle. Without the link, miles
 * by state from the ELD can't land on this truck, so IFTA can't count them.
 */
export function EldBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <span
      className={cn(
        pill,
        "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      )}
    >
      <Link2 aria-hidden />
      Connected
    </span>
  ) : (
    <span
      className={cn(pill, "bg-muted text-muted-foreground")}
      title="Add the Motive vehicle ID so IFTA miles land on this truck."
    >
      <Unlink aria-hidden />
      Not connected
    </span>
  )
}
