import Link from "next/link"

import { DetentionClock } from "@/components/loads/detention-clock"
import { SettingsCard } from "@/components/settings/settings-card"
import type { WaitingStop } from "@/lib/dashboard"
import { cityState } from "@/lib/report-format"
import { STOP_KIND_LABELS } from "@/lib/schemas/load"

/**
 * Drivers waiting at a stop right now, with the clock on their free time:
 * who to chase before detention starts, and what's already running. Only
 * shown while someone's waiting.
 */
export function OnTheClock({
  stops,
  loadsBase,
}: {
  stops: WaitingStop[]
  /** /org/<slug>/loads */
  loadsBase: string
}) {
  if (stops.length === 0) return null
  return (
    <SettingsCard
      title="On the clock"
      description="Drivers waiting at a stop now. Detention starts when free time runs out."
      contentClassName="px-0 pb-0"
    >
      <ul className="divide-y border-t">
        {stops.map((stop) => (
          <li
            key={stop.id}
            className="flex flex-col gap-1 px-6 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <Link
                href={`${loadsBase}/${stop.load.id}`}
                className="font-medium hover:underline"
              >
                {stop.load.reference}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {STOP_KIND_LABELS[stop.kind]} {stop.position} ·{" "}
                {[stop.facility, cityState(stop.location)]
                  .filter(Boolean)
                  .join(", ")}
                {stop.load.driver_name && ` · ${stop.load.driver_name}`}
              </p>
            </div>
            <DetentionClock stop={stop} terms={stop.load} />
          </li>
        ))}
      </ul>
    </SettingsCard>
  )
}
