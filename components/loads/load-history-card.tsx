import { ArrowLeft, Ban, History, RotateCcw, Send } from "lucide-react"

import { LocalTime } from "@/components/loads/local-time"
import {
  SettingsCard,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
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
    case "reopened":
      return `Reopened from ${label(event.from_status).toLowerCase()}, back to booked`
    default:
      return `${label(event.from_status)} → ${label(event.to_status)}`
  }
}

const ICONS = {
  dispatched: Send,
  resent: Send,
  unassigned: ArrowLeft,
  reopened: RotateCcw,
  status: History,
}

/** Every status change on the load, newest first, with who made it. */
export function LoadHistoryCard({ events }: { events: LoadEvent[] }) {
  return (
    <SettingsCard title="History">
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
    </SettingsCard>
  )
}
