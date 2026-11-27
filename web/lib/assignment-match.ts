// Shared by server and client: no server-only imports here.
//
// Ranks who should run a load: each free truck, paired with the driver who
// fits it best, scored on empty miles, whether it makes the pickup in time,
// who usually drives it, where the driver will be, and expiring paperwork.
// Times are wall-clock strings at each stop ("YYYY-MM-DDTHH:mm"), compared
// as written, so across time zones they're off by an hour or two at most.

/** One truck, as the plan sees it for this load. */
export type TruckCandidate = {
  truckId: string
  unit: string
  defaultDriverId: string | null
  /** "Dallas, TX": its last delivery before the pickup, or home base. */
  from: string | null
  /** The load it's coming off; null when it starts from home base. */
  afterLoad: string | null
  /** When that load is done, wall-clock; null for home base. */
  freeAt: string | null
  emptyMiles: number | null
  /** Driving time for the empty miles, in hours. */
  emptyHours: number | null
  /** Another load on it at the same time. */
  busyWith: string | null
  /** Hauling a load right now. */
  inTransitWith: string | null
  /** The first paperwork problem (inspection, registration, plate), if any. */
  problem: string | null
}

/** One driver, as the plan sees them for this load. */
export type DriverCandidate = {
  driverId: string
  name: string
  /** Another load of theirs at the same time. */
  busyWith: string | null
  /** Hauling a load right now. */
  inTransitWith: string | null
  /** Their last load before this pickup: which, on what truck, ending where. */
  lastLoad: string | null
  lastTruckId: string | null
  lastPlace: string | null
  lastFreeAt: string | null
  /** Loads they've run on each truck lately, by truck id. */
  trips: Record<string, number>
  /** The first paperwork problem (CDL, medical card, checks), if any. */
  problem: string | null
}

export type MatchLine = { text: string; tone: "good" | "info" | "warn" }

export type Suggestion = {
  truckId: string
  driverId: string | null
  /** Lower is better. */
  score: number
  /** Nothing in the way: free, on time, paperwork good. */
  clean: boolean
  lines: MatchLine[]
}

/** How many loads on a truck make a driver one of its regulars. */
const REGULAR_TRIPS = 2
/** Empty miles assumed when they couldn't be routed. */
const UNKNOWN_MILES = 400

const clock = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
})

/** "2026-12-01T15:00" → "Dec 1, 3:00 PM", as written. */
export function formatWallClock(value: string) {
  return clock.format(new Date(`${value.slice(0, 16)}:00Z`))
}

function wallMs(value: string) {
  return Date.parse(`${value.slice(0, 16)}:00Z`)
}

/** "about 3 h", "about 45 min" */
export function formatHours(hours: number) {
  if (hours < 1)
    return `about ${Math.max(5, Math.round((hours * 60) / 5) * 5)} min`
  return `about ${Math.round(hours)} h`
}

/**
 * When the truck could be at the pickup, and how that compares to the
 * appointment: hours to spare (negative when it's late). Null when it can't
 * be told (no pickup time, or no driving time).
 */
export function pickupSlack(
  truck: Pick<TruckCandidate, "freeAt" | "emptyHours">,
  pickupStart: string | null,
  now: string
): number | null {
  if (!pickupStart || truck.emptyHours === null) return null
  const leaves = Math.max(wallMs(truck.freeAt ?? now), wallMs(now))
  const arrives = leaves + truck.emptyHours * 3_600_000
  return (wallMs(pickupStart) - arrives) / 3_600_000
}

/** The driver's fit with one truck: lower is better, with why. */
function driverFit(
  driver: DriverCandidate,
  truck: TruckCandidate,
  defaultOf: Map<string, string>
): { score: number; lines: MatchLine[] } {
  const first = driver.name.split(" ")[0]
  const lines: MatchLine[] = []
  let score = 0
  const trips = driver.trips[truck.truckId] ?? 0
  if (truck.defaultDriverId === driver.driverId) {
    score -= 60
    lines.push({ text: `${first} usually drives ${truck.unit}`, tone: "good" })
  } else if (trips >= REGULAR_TRIPS) {
    score -= 30
    lines.push({
      text: `${first} has driven ${truck.unit} on ${trips} recent loads`,
      tone: "good",
    })
  } else {
    // Taking another truck's regular driver leaves that truck without one.
    const own = defaultOf.get(driver.driverId)
    if (own && own !== truck.truckId) {
      score += 40
      lines.push({ text: `${first} usually drives ${own}`, tone: "info" })
    }
  }
  if (driver.lastTruckId === truck.truckId) {
    score -= 10
  } else if (
    driver.lastTruckId &&
    driver.lastPlace &&
    driver.lastPlace !== truck.from
  ) {
    // They'll be with another truck somewhere else.
    score += 80
    lines.push({
      text: `${first} ends ${driver.lastLoad} in ${driver.lastPlace}, away from this truck`,
      tone: "warn",
    })
  }
  if (driver.problem) {
    score += 500
    lines.push({ text: `${first}: ${driver.problem}`, tone: "warn" })
  }
  return { score, lines }
}

/**
 * The best truck and driver pairs for a load (six; the form shows three
 * until asked for more), best first, one per truck. Busy trucks are left
 * out; a truck with no free driver is still offered, scored lower, so the
 * truck can be picked and a driver found.
 */
export function suggestAssignments({
  trucks,
  drivers,
  pickupStart,
  now,
  limit = 6,
}: {
  trucks: TruckCandidate[]
  drivers: DriverCandidate[]
  /** The first pickup's appointment, wall-clock; null if not set yet. */
  pickupStart: string | null
  /** Now, wall-clock in the company's time zone. */
  now: string
  limit?: number
}): Suggestion[] {
  const defaultOf = new Map<string, string>()
  for (const truck of trucks) {
    if (truck.defaultDriverId) defaultOf.set(truck.defaultDriverId, truck.unit)
  }
  const free = drivers.filter((driver) => !driver.busyWith)

  // Each free truck with every free driver ranked for it, best trucks first.
  // Drivers are then handed out down the list, so two trucks aren't offered
  // the same driver while another is free.
  const taken = new Set<string>()
  const suggestions = trucks
    .filter((truck) => !truck.busyWith)
    .map((truck) => {
      const lines: MatchLine[] = []
      let score = truck.emptyMiles ?? UNKNOWN_MILES
      let clean = true

      // Where it starts, and how far.
      const where = truck.afterLoad
        ? `Free in ${truck.from}${truck.freeAt ? ` ${formatWallClock(truck.freeAt)}` : ""} after ${truck.afterLoad}`
        : truck.from
          ? `At home base in ${truck.from}`
          : "No earlier load or home base to start from"
      const miles =
        truck.emptyMiles === null
          ? ""
          : truck.emptyMiles === 0
            ? " · already there"
            : ` · ${truck.emptyMiles.toLocaleString("en-US")} empty mi${truck.emptyHours !== null ? `, ${formatHours(truck.emptyHours)}` : ""}`
      lines.push({ text: where + miles, tone: "info" })
      if (truck.inTransitWith && truck.inTransitWith !== truck.afterLoad) {
        lines.push({ text: `Hauling ${truck.inTransitWith} now`, tone: "info" })
      }

      const slack = pickupSlack(truck, pickupStart, now)
      if (slack !== null && slack < 0) {
        score += 600
        clean = false
        lines.push({
          text: `Probably late to the pickup, by ${formatHours(-slack)}`,
          tone: "warn",
        })
      } else if (slack !== null && slack < 2 && truck.afterLoad) {
        score += 60
        lines.push({
          text: `Tight: ${formatHours(slack)} to spare before the pickup`,
          tone: "warn",
        })
      }
      if (truck.problem) {
        score += 500
        clean = false
        lines.push({ text: `${truck.unit}: ${truck.problem}`, tone: "warn" })
      }

      // The drivers who fit this truck, best first.
      const fits = free
        .map((driver) => ({ driver, ...driverFit(driver, truck, defaultOf) }))
        .sort((a, b) => a.score - b.score)
      return { truck, lines, score, clean, fits }
    })
    .sort(
      (a, b) =>
        a.score +
        (a.fits[0]?.score ?? 250) -
        (b.score + (b.fits[0]?.score ?? 250))
    )
    .map(
      ({
        truck,
        lines,
        score: truckScore,
        clean: truckClean,
        fits,
      }): Suggestion => {
        let score = truckScore
        let clean = truckClean
        // The best driver nobody above has been offered; when every driver
        // has, the best one again, so the truck can still be picked.
        const best =
          fits.find((fit) => !taken.has(fit.driver.driverId)) ?? fits[0] ?? null
        if (best) taken.add(best.driver.driverId)
        if (!best) {
          score += 250
          clean = false
          lines.push({ text: "No driver is free then", tone: "warn" })
        } else {
          score += best.score
          if (best.driver.problem) clean = false
          lines.push(...best.lines)
        }
        // Why the truck's usual driver isn't the one offered.
        const usual = drivers.find(
          (driver) => driver.driverId === truck.defaultDriverId
        )
        if (usual && usual.driverId !== best?.driver.driverId) {
          const why = usual.busyWith
            ? `is on ${usual.busyWith} then`
            : usual.problem
              ? `is out (${usual.problem})`
              : usual.lastPlace && usual.lastTruckId !== truck.truckId
                ? `ends ${usual.lastLoad} in ${usual.lastPlace}`
                : null
          if (why) {
            lines.push({
              text: `Usual driver ${usual.name} ${why}`,
              tone: "info",
            })
          }
        }
        return {
          truckId: truck.truckId,
          driverId: best?.driver.driverId ?? null,
          score,
          clean,
          lines,
        }
      }
    )
    .sort((a, b) => a.score - b.score)
  return suggestions.slice(0, limit)
}

/** The line under a driver in the driver picker. */
export function describeDriver(
  driver: DriverCandidate
): { text: string; tone: "info" | "warn" } | null {
  if (driver.busyWith) {
    return { text: `On load ${driver.busyWith} at the same time`, tone: "warn" }
  }
  if (driver.lastLoad && driver.lastPlace) {
    return {
      text: `Free in ${driver.lastPlace}${driver.lastFreeAt ? ` ${formatWallClock(driver.lastFreeAt)}` : ""} after ${driver.lastLoad}`,
      tone: "info",
    }
  }
  if (driver.inTransitWith) {
    return { text: `Hauling ${driver.inTransitWith} now`, tone: "info" }
  }
  return null
}
