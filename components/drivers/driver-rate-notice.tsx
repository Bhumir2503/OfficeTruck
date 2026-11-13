"use client"

import { RefreshCw } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { applyRateToUpcomingLoads } from "@/app/org/[slug]/drivers/actions"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"

/**
 * Shown when some of a driver's booked loads are still locked at an older
 * rate, e.g. after a raise. Applying moves just those loads onto the current
 * rate; loads already driven keep theirs.
 */
export function DriverRateNotice({
  organizationId,
  driverId,
  driverName,
  currentRate,
  stale,
}: {
  organizationId: string
  driverId: string
  driverName: string
  /** "$0.65 / mile" */
  currentRate: string
  /** Booked loads on another rate, with the rate each is locked at. */
  stale: { reference: string; locked: string }[]
}) {
  const [pending, setPending] = useState(false)
  const count = stale.length
  const rates = [...new Set(stale.map((load) => load.locked))]

  async function apply() {
    setPending(true)
    const result = await applyRateToUpcomingLoads(organizationId, driverId)
    setPending(false)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success(
      result.changed === 0
        ? "Those loads are already on the current rate."
        : `${result.changed} upcoming ${result.changed === 1 ? "load" : "loads"} now ${result.changed === 1 ? "pays" : "pay"} ${currentRate}.`
    )
  }

  return (
    <SettingsCard
      title="Upcoming loads on an older rate"
      description={`${driverName} is now paid ${currentRate}, but ${count} booked ${count === 1 ? "load is" : "loads are"} still locked at ${rates.join(" or ")}.`}
      footer={
        <SettingsCardFooter hint="Loads in transit, delivered or invoiced keep the rate they were locked at.">
          <Button size="sm" disabled={pending} onClick={apply}>
            <RefreshCw className={pending ? "animate-spin" : undefined} />
            {pending
              ? "Applying…"
              : `Apply ${currentRate} to ${count === 1 ? "it" : `these ${count}`}`}
          </Button>
        </SettingsCardFooter>
      }
    >
      <ul className="flex flex-wrap gap-2 text-sm">
        {stale.map((load) => (
          <li
            key={load.reference}
            className="rounded-md border bg-muted/40 px-2.5 py-1"
          >
            <span className="font-medium">{load.reference}</span>{" "}
            <span className="text-muted-foreground">at {load.locked}</span>
          </li>
        ))}
      </ul>
    </SettingsCard>
  )
}
