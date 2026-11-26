"use client"

import { Check, Loader2, RefreshCw, Sparkles } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { getAssignmentPlan } from "@/app/org/[slug]/loads/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "cn"
import type { MatchLine } from "@/lib/assignment-match"
import type { AssignmentPlan } from "@/lib/assignment-plan"
import type { DriverOption } from "@/lib/drivers"
import type { TruckOption } from "@/lib/trucks"

export type PlanInput =
  /** `version` changes when the saved stops do, to work it out again. */
  | { loadId: string; version?: string }
  | {
      pickupLocation: string
      pickupStart: string | null
      deliveryEnd: string | null
    }

/**
 * Works out the assignment plan for a load: right away when `enabled`, and
 * again when `input` changes (after `delay`, so typing in New Load's stops
 * doesn't route on every key). `refresh()` runs it on demand.
 */
export function useAssignmentPlan(
  organizationId: string,
  input: PlanInput | null,
  { enabled = true, delay = 0 }: { enabled?: boolean; delay?: number } = {}
) {
  const [plan, setPlan] = useState<AssignmentPlan | null>(null)
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState(false)
  const key = input ? JSON.stringify(input) : null
  const latest = useRef<string | null>(null)

  const run = useCallback(async () => {
    if (!key) return
    latest.current = key
    setWorking(true)
    setFailed(false)
    try {
      const found = await getAssignmentPlan(organizationId, JSON.parse(key))
      if (latest.current !== key) return
      setPlan(found)
      setFailed(!found)
    } catch {
      if (latest.current === key) setFailed(true)
    } finally {
      if (latest.current === key) setWorking(false)
    }
  }, [organizationId, key])

  useEffect(() => {
    if (!enabled || !key) return
    const timer = setTimeout(() => void run(), delay)
    return () => clearTimeout(timer)
  }, [enabled, key, delay, run])

  return { plan, working, failed, refresh: run, ready: !!key }
}

/** Suggestions shown before "Show more". */
const SHOWN = 3

const toneClass: Record<MatchLine["tone"], string> = {
  good: "text-emerald-700 dark:text-emerald-400",
  info: "text-muted-foreground",
  warn: "text-amber-700 dark:text-amber-300",
}

/**
 * The best truck and driver pairs for a load, best first, each with why and
 * a Use button that fills in both pickers.
 */
export function AssignmentSuggestions({
  plan,
  working,
  failed,
  ready,
  onRefresh,
  trucks,
  drivers,
  truckId,
  driverId,
  onUse,
  hint = "Add the first pickup's address and time to see who fits best.",
}: {
  plan: AssignmentPlan | null
  working: boolean
  failed: boolean
  /** There's a pickup to plan for. */
  ready: boolean
  onRefresh: () => void
  trucks: TruckOption[]
  drivers: DriverOption[]
  /** What's picked now, to mark the suggestion in use. */
  truckId: string | null
  driverId: string | null
  onUse: (truckId: string, driverId: string | null) => void
  /** Shown while there's no pickup to plan for. */
  hint?: string
}) {
  const unit = (id: string) =>
    trucks.find((truck) => truck.id === id)?.unit_number ?? "Truck"
  const name = (id: string | null) =>
    drivers.find((driver) => driver.id === id)?.full_name ?? null
  const [showAll, setShowAll] = useState(false)
  const all = plan?.suggestions ?? []
  // Three to start, plus whichever one is picked now.
  const suggestions = showAll
    ? all
    : all.filter(
        (suggestion, index) => index < SHOWN || suggestion.truckId === truckId
      )

  return (
    <section
      aria-label="Best matches"
      className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-4 text-violet-600 dark:text-violet-400" />
          Best matches
        </h3>
        {ready && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={working}
          >
            {working ? (
              <Loader2 className="animate-spin" />
            ) : plan ? (
              <RefreshCw />
            ) : (
              <Sparkles />
            )}
            {working ? "Checking…" : plan ? "Check again" : "Find matches"}
          </Button>
        )}
      </div>

      {!ready ? (
        <p className="text-sm text-muted-foreground">{hint}</p>
      ) : !plan && !working && !failed ? (
        <p className="text-sm text-muted-foreground">
          See which truck and driver fit this load best: where each truck will
          be, who usually drives it, and who&apos;s free.
        </p>
      ) : !plan && working ? (
        <p className="text-sm text-muted-foreground">
          Looking at where each truck will be and who&apos;s free…
        </p>
      ) : failed ? (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t work out matches right now. Pick a truck and driver
          below.
        </p>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Every active truck is on another load at the same time.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {suggestions.map((suggestion, index) => {
            const inUse =
              suggestion.truckId === truckId &&
              (suggestion.driverId ?? null) === (driverId ?? null)
            const driverName = name(suggestion.driverId)
            return (
              <li
                key={suggestion.truckId}
                className={cn(
                  "flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-start sm:justify-between",
                  inUse && "border-primary"
                )}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {unit(suggestion.truckId)}
                      {driverName ? ` · ${driverName}` : " · no driver"}
                    </span>
                    {index === 0 && suggestion.clean && (
                      <Badge variant="secondary">Best match</Badge>
                    )}
                  </div>
                  <ul className="flex flex-col gap-0.5">
                    {suggestion.lines.map((line) => (
                      <li
                        key={line.text}
                        className={cn("text-xs", toneClass[line.tone])}
                      >
                        {line.text}
                      </li>
                    ))}
                  </ul>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={inUse ? "secondary" : "outline"}
                  className="w-fit shrink-0"
                  disabled={inUse}
                  onClick={() => onUse(suggestion.truckId, suggestion.driverId)}
                >
                  {inUse ? (
                    <>
                      <Check />
                      Picked
                    </>
                  ) : (
                    "Use"
                  )}
                </Button>
              </li>
            )
          })}
        </ol>
      )}
      {all.length > SHOWN && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => setShowAll((shown) => !shown)}
        >
          {showAll ? "Show fewer" : `Show ${all.length - SHOWN} more`}
        </Button>
      )}
    </section>
  )
}
