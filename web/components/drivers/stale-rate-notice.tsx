"use client"

import { cn } from "cn"
import { RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { applyRateToUpcomingLoads } from "@/app/org/[slug]/drivers/actions"
import { Button } from "@/components/ui/button"

/**
 * On the Pay card: upcoming loads still locked at an older rate, with a way
 * to move them onto the driver's current one.
 */
export function StaleRateNotice({
  organizationId,
  driverId,
  currentRate,
  stale,
  className,
}: {
  organizationId: string
  driverId: string
  /** "$0.65 / mile" */
  currentRate: string
  /** Booked or dispatched loads on another rate, with the rate each is locked at. */
  stale: { reference: string; locked: string }[]
  className?: string
}) {
  const router = useRouter()
  const [applying, startApply] = useTransition()
  const count = stale.length

  function apply() {
    startApply(async () => {
      const result = await applyRateToUpcomingLoads(organizationId, driverId)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(
        result.changed === 0
          ? "Those loads are already on the current rate."
          : `${result.changed} upcoming ${result.changed === 1 ? "load" : "loads"} now ${result.changed === 1 ? "pays" : "pay"} ${currentRate}.`
      )
      router.refresh()
    })
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-muted/30 p-4",
        className
      )}
    >
      <p className="text-sm">
        {count} upcoming {count === 1 ? "load is" : "loads are"} still locked at
        an older rate.
      </p>
      <ul className="flex flex-wrap gap-1.5 text-xs">
        {stale.map((load) => (
          <li
            key={load.reference}
            className="rounded-md border bg-background px-2 py-0.5"
          >
            <span className="font-medium">{load.reference}</span>{" "}
            <span className="text-muted-foreground">at {load.locked}</span>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={applying}
        onClick={apply}
        className="self-start"
      >
        <RefreshCw className={applying ? "animate-spin" : undefined} />
        {applying ? "Applying…" : `Apply ${currentRate}`}
      </Button>
      <p className="text-xs text-muted-foreground">
        Loads in transit, delivered or invoiced keep their rate.
      </p>
    </div>
  )
}
