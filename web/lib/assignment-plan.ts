// Who should run a load, worked out on the server: where each truck will be
// and how far it is from the pickup (lib/empty-miles), what each driver is
// doing then, who usually drives what, and paperwork that runs out. The
// ranking itself is in lib/assignment-match, shared with the browser.
//
// "Where the truck is" is where its last load before this one delivers (or
// its home base). Live truck locations come later from the ELD (see
// docs/eld-integration.md).

import { assignmentProblems, problemShort } from "@/lib/assignment-compliance"
import {
  type DriverCandidate,
  type Suggestion,
  suggestAssignments,
  type TruckCandidate,
} from "@/lib/assignment-match"
import { SCHEDULED_STATUSES } from "@/lib/dispatch-format"
import { getDriverOptions } from "@/lib/drivers"
import {
  shortPlace,
  truckStartingPoints,
  type TruckStartingPoint,
} from "@/lib/empty-miles"
import { createClient } from "@/lib/supabase/server"
import { getTruckOptions } from "@/lib/trucks"

/** How far back a driver's loads on a truck count toward being its regular. */
const HISTORY_DAYS = 120

export type AssignmentPlan = {
  /** For the truck picker's lines. */
  points: TruckStartingPoint[]
  trucks: TruckCandidate[]
  drivers: DriverCandidate[]
  suggestions: Suggestion[]
}

/** Now as a wall-clock time in the company's time zone, "YYYY-MM-DDTHH:mm". */
function wallNow(timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

const wall = (value: string | null | undefined) =>
  value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
    ? value.slice(0, 16)
    : null

export async function assignmentPlan({
  organizationId,
  pickupLocation,
  pickupStart,
  deliveryEnd,
  excludeLoadId,
}: {
  organizationId: string
  pickupLocation: string
  /** Wall-clock time of the first pickup; now if unknown. */
  pickupStart: string | null
  /** Wall-clock end of the last stop; the pickup if unknown. */
  deliveryEnd: string | null
  /** The load itself, when it's already saved. */
  excludeLoadId?: string
}): Promise<AssignmentPlan> {
  const supabase = await createClient()
  const { data: organization } = await supabase
    .from("organizations")
    .select("time_zone")
    .eq("id", organizationId)
    .maybeSingle()
  const now = wallNow(organization?.time_zone ?? "America/Chicago")
  const start = wall(pickupStart) ?? now
  const end = wall(deliveryEnd) ?? start
  const until = end.slice(0, 10)
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10)

  let loadsQuery = supabase
    .from("loads")
    .select(
      "id, reference, status, driver_id, truck_id, pickup_start, delivery_start, delivery_end, delivery_location"
    )
    .eq("organization_id", organizationId)
    .not("driver_id", "is", null)
    .not("status", "in", "(cancelled,tonu)")
    .or(`pickup_start.gte.${since},status.in.(${SCHEDULED_STATUSES.join(",")})`)
    .order("delivery_start", { ascending: false })
  if (excludeLoadId) loadsQuery = loadsQuery.neq("id", excludeLoadId)

  const [points, truckOptions, driverOptions, { data: loads }] =
    await Promise.all([
      truckStartingPoints({
        organizationId,
        pickupLocation,
        pickupStart,
        deliveryEnd,
        excludeLoadId,
      }),
      getTruckOptions(organizationId),
      getDriverOptions(organizationId),
      loadsQuery,
    ])

  const pointOf = new Map(points.map((point) => [point.truckId, point]))
  const trucks: TruckCandidate[] = truckOptions
    .filter((truck) => truck.status === "active" && pointOf.has(truck.id))
    .map((truck) => {
      const point = pointOf.get(truck.id)!
      const problem = assignmentProblems(truck.compliance, until)[0]
      return {
        truckId: truck.id,
        unit: truck.unit_number,
        defaultDriverId: truck.default_driver_id,
        from: point.from,
        afterLoad: point.afterLoad,
        freeAt: point.freeAt,
        emptyMiles: point.emptyMiles,
        emptyHours: point.emptyHours,
        busyWith: point.busyWith,
        inTransitWith: point.inTransitWith,
        problem: problem ? problemShort(problem) : null,
      }
    })

  const drivers: DriverCandidate[] = driverOptions
    .filter((driver) => driver.status === "active")
    .map((driver) => {
      const mine = (loads ?? []).filter((load) => load.driver_id === driver.id)
      const busy = mine.find((load) => {
        if (!(SCHEDULED_STATUSES as readonly string[]).includes(load.status)) {
          return false
        }
        const loadStart = (load.pickup_start as string).slice(0, 16)
        const loadEnd = (
          (load.delivery_end ?? load.delivery_start) as string
        ).slice(0, 16)
        // A load with no delivery time yet is just its pickup moment.
        const startsBefore = end > start ? loadStart < end : loadStart <= start
        return startsBefore && start < loadEnd
      })
      // Newest first: the last one delivering at or before the pickup.
      const previous = mine.find(
        (load) => (load.delivery_start as string).slice(0, 16) <= start
      )
      const trips: Record<string, number> = {}
      for (const load of mine) {
        if (load.truck_id && (load.pickup_start as string) >= since) {
          trips[load.truck_id] = (trips[load.truck_id] ?? 0) + 1
        }
      }
      const problem = assignmentProblems(driver.compliance, until)[0]
      return {
        driverId: driver.id,
        name: driver.full_name,
        busyWith: busy ? (busy.reference as string) : null,
        inTransitWith:
          (mine.find((load) => load.status === "loaded")?.reference as
            string | undefined) ?? null,
        lastLoad: previous ? (previous.reference as string) : null,
        lastTruckId: (previous?.truck_id as string | null) ?? null,
        lastPlace: previous?.delivery_location
          ? shortPlace(previous.delivery_location as string)
          : null,
        lastFreeAt: previous
          ? (
              (previous.delivery_end ?? previous.delivery_start) as string
            ).slice(0, 16)
          : null,
        trips,
        problem: problem ? problemShort(problem) : null,
      }
    })

  return {
    points,
    trucks,
    drivers,
    suggestions: suggestAssignments({
      trucks,
      drivers,
      pickupStart: wall(pickupStart),
      now,
    }),
  }
}
