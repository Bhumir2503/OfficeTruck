"use client"

import { cn } from "cn"
import { useEffect, useRef, useState } from "react"

import { getTruckStartingPoints } from "@/app/org/[slug]/loads/actions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { assignmentProblems, problemShort } from "@/lib/assignment-compliance"
import type { TruckStartingPoint } from "@/lib/empty-miles"
import type { TruckOption } from "@/lib/trucks"

const NONE = "none"

/** Which load the truck is for: a saved one, or New load's first pickup. */
export type TruckSelectLoad =
  | { loadId: string }
  | { pickup: () => { location: string; start: string | null } }

const freeAtFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
})

/** "2026-12-01T15:00" → "Dec 1, 3:00 PM" (wall-clock, as entered). */
function formatFreeAt(value: string) {
  return freeAtFormat.format(new Date(`${value}:00Z`))
}

/** The line under a truck in the picker: where it starts from, and how far. */
function describe(point: TruckStartingPoint) {
  if (point.busyWith) {
    return `On load ${point.busyWith} at the same time`
  }
  if (!point.from) return "No earlier load or home base"
  const where = point.afterLoad
    ? `Free in ${point.from}${point.freeAt ? `, ${formatFreeAt(point.freeAt)}` : ""}`
    : `Home base, ${point.from}`
  return point.emptyMiles === null
    ? where
    : `${where} · ${point.emptyMiles.toLocaleString("en-US")} empty mi`
}

/** Free trucks first, nearest first; ones with no distance, then busy ones. */
function rank(point: TruckStartingPoint | undefined) {
  if (!point) return Number.MAX_SAFE_INTEGER
  if (point.busyWith) return Number.MAX_SAFE_INTEGER - 1
  return point.emptyMiles ?? Number.MAX_SAFE_INTEGER - 2
}

/**
 * A truck picker that fills a hidden `truck_id` input ("" for no truck).
 * Lists active trucks, plus the current one if it's since been parked or
 * retired. `onPick` gets the chosen truck, e.g. to prefill its driver.
 * Given a load, it shows under each truck where it would start from (its
 * last delivery before the pickup, or home base) and the empty miles, nearest
 * first, worked out when the list is opened. A truck whose inspection,
 * registration or plate is past, or runs out before `until`, says so in red.
 */
export function TruckSelect({
  id,
  trucks,
  defaultValue,
  invalid,
  onPick,
  onUpdate,
  organizationId,
  load,
  until = null,
}: {
  id: string
  trucks: TruckOption[]
  defaultValue?: string | null
  invalid?: boolean
  onPick?: (truck: TruckOption | null) => void
  onUpdate: (form: HTMLFormElement | null) => void
  /** With `load`, to show where each truck would start from. */
  organizationId?: string
  load?: TruckSelectLoad
  /** The load's last day, "YYYY-MM-DD", to flag dates that run out by then. */
  until?: string | null
}) {
  const [value, setValue] = useState(defaultValue ?? NONE)
  const [points, setPoints] = useState<Map<string, TruckStartingPoint>>()
  const [working, setWorking] = useState(false)
  // What the starting points were worked out for, to redo them if it changes.
  const forKey = useRef<string | null>(null)

  async function loadPoints() {
    if (!organizationId || !load) return
    const input =
      "loadId" in load
        ? { loadId: load.loadId }
        : {
            pickupLocation: load.pickup().location,
            pickupStart: load.pickup().start,
          }
    const key = JSON.stringify(input)
    if (key === forKey.current) return
    forKey.current = key
    setWorking(true)
    try {
      const found = await getTruckStartingPoints(organizationId, input)
      if (forKey.current !== key) return
      setPoints(new Map(found.map((point) => [point.truckId, point])))
    } catch {
      forKey.current = null
    } finally {
      setWorking(false)
    }
  }
  const hiddenRef = useRef<HTMLInputElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onUpdate(hiddenRef.current?.form ?? null)
    // Only when the value changes; onUpdate is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const options = trucks
    .filter((truck) => truck.status === "active" || truck.id === defaultValue)
    .sort((a, b) =>
      points ? rank(points.get(a.id)) - rank(points.get(b.id)) : 0
    )
  const items = [
    { value: NONE, label: "No truck" },
    ...options.map((truck) => ({
      value: truck.id,
      label:
        truck.status === "active"
          ? truck.unit_number
          : `${truck.unit_number} (${truck.status === "inactive" ? "inactive" : "out of service"})`,
    })),
  ]

  return (
    <>
      <input
        ref={hiddenRef}
        type="hidden"
        name="truck_id"
        value={value === NONE ? "" : value}
      />
      <Select
        value={value}
        onValueChange={(next) => {
          const chosen = (next as string | null) ?? NONE
          setValue(chosen)
          onPick?.(trucks.find((truck) => truck.id === chosen) ?? null)
        }}
        items={items}
        onOpenChange={(open) => {
          if (open) void loadPoints()
        }}
      >
        <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {working && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Working out where each truck is…
            </p>
          )}
          {items.map((item) => {
            const point = points?.get(item.value)
            const truck = options.find((option) => option.id === item.value)
            const problems = truck
              ? assignmentProblems(truck.compliance, until)
              : []
            return (
              <SelectItem key={item.value} value={item.value}>
                {item.value === NONE ? (
                  <span className="text-muted-foreground">{item.label}</span>
                ) : point || problems.length ? (
                  <span className="flex flex-col items-start gap-0.5">
                    <span>{item.label}</span>
                    {point && (
                      <span
                        className={cn(
                          "text-xs",
                          point.busyWith
                            ? "text-amber-700 dark:text-amber-300"
                            : "text-muted-foreground"
                        )}
                      >
                        {describe(point)}
                      </span>
                    )}
                    {problems.length > 0 && (
                      <span className="text-xs text-destructive">
                        {problemShort(problems[0])}
                        {problems.length > 1 &&
                          ` and ${problems.length - 1} more`}
                      </span>
                    )}
                  </span>
                ) : (
                  item.label
                )}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </>
  )
}
