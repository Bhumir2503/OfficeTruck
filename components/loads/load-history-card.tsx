import {
  ArrowLeft,
  Ban,
  ChevronDown,
  Clock,
  History,
  RotateCcw,
  Send,
} from "lucide-react"

import { LocalTime } from "@/components/loads/local-time"
import { SettingsEmptyState } from "@/components/settings/settings-card"
import type { LoadEvent } from "@/lib/dispatch"
import { LOAD_STATUS_LABELS, type LoadStatus } from "@/lib/schemas/load"

const label = (status: string | null) =>
  status ? (LOAD_STATUS_LABELS[status as LoadStatus] ?? status) : ""

function describe(event: LoadEvent) {
  switch (event.kind) {
    case "dispatched":
      return event.detail ?? "Sent to the driver"
    case "resent":
      return event.detail ?? "Sent to the driver again"
    case "unassigned":
      return `${event.detail ?? "Unassigned"}, back to booked`
    case "stop_time":
      return event.detail ?? "Stop time entered by the office"
    case "reopened":
      return `Reopened from ${label(event.from_status).toLowerCase()}, back to booked`
    default:
      return `${label(event.from_status)} → ${label(event.to_status)}${event.detail ? `: ${event.detail}` : ""}`
  }
}

const ICONS = {
  dispatched: Send,
  resent: Send,
  unassigned: ArrowLeft,
  reopened: RotateCcw,
  status: History,
  stop_time: Clock,
}

/**
 * Every status change on the load, newest first, with who made it. Folded
 * away by default: it's the record, not what people open a load for.
 */
export function LoadHistoryCard({ events }: { events: LoadEvent[] }) {
  return (
    <details className="group overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold">History</span>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {events.length === 0
            ? "No changes yet"
            : `${events.length} ${events.length === 1 ? "change" : "changes"}`}
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t px-5 py-4">
        {events.length === 0 ? (
          <SettingsEmptyState icon={History} title="No changes yet">
            Status changes, sends to the driver and unassigns show up here.
          </SettingsEmptyState>
        ) : (
          <ol className="flex flex-col gap-3">
            {events.map((event) => {
              const Icon =
                event.to_status === "cancelled" || event.to_status === "tonu"
                  ? Ban
                  : ICONS[event.kind]
              const backward =
                event.kind === "unassigned" || event.kind === "reopened"
              return (
                <li key={event.id} className="flex items-start gap-3 text-sm">
                  <span
                    className={
                      backward
                        ? "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                    }
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">{describe(event)}</p>
                    <p className="text-muted-foreground">
                      {event.actor_name ?? "Automatically"} ·{" "}
                      <LocalTime value={event.created_at} />
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </details>
  )
}
