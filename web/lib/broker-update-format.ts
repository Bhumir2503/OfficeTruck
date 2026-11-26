// Shared by server and tests: no server-only imports here.
//
// The words of an automatic status update to a broker: a driver arrived at
// or left a stop, or the load was delivered. Never the rate or charges.

export type BrokerUpdateEvent = "arrived" | "departed" | "delivered"

export type BrokerUpdateStop = {
  position: number
  kind: "pickup" | "delivery"
  facility: string | null
  location: string
  /** The pickup or delivery number. */
  stop_number: string | null
  arrived_at: string | null
  departed_at: string | null
  arrived_source: string | null
  departed_source: string | null
  arrived_latitude: number | null
  arrived_longitude: number | null
  arrived_location_accuracy_m: number | null
  departed_latitude: number | null
  departed_longitude: number | null
  departed_location_accuracy_m: number | null
}

export type BrokerUpdateInput = {
  companyName: string
  /** The company's time zone, e.g. "America/Chicago". */
  timeZone: string
  reference: string
  event: BrokerUpdateEvent
  /** The stop it's about; for a delivery, the last stop (if any). */
  stop: BrokerUpdateStop | null
  stopCount: number
  /** When it happened, for a delivery with no check-out time: ISO. */
  at: string
}

export type BrokerUpdateMessage = {
  subject: string
  /** The lines of the update, plain text. */
  lines: string[]
  /** A map link to where the driver's phone was, if it was saved. */
  mapUrl: string | null
}

const KIND = { pickup: "pickup", delivery: "delivery" } as const

/** "Dec 3, 2026, 9:02 AM CST", in the company's time zone. */
export function formatUpdateTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(new Date(iso))
}

/** Where the driver's phone was at the event, as a map link. */
function place(stop: BrokerUpdateStop, event: "arrived" | "departed") {
  const latitude =
    event === "arrived" ? stop.arrived_latitude : stop.departed_latitude
  const longitude =
    event === "arrived" ? stop.arrived_longitude : stop.departed_longitude
  const accuracy =
    event === "arrived"
      ? stop.arrived_location_accuracy_m
      : stop.departed_location_accuracy_m
  if (latitude === null || longitude === null) return null
  return {
    url: `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(5)},${longitude.toFixed(5)}`,
    accuracy: accuracy === null ? null : `±${Math.round(accuracy)} m`,
  }
}

/** "pickup 1 of 2", "delivery 2 of 2" */
function stopName(stop: BrokerUpdateStop, count: number) {
  return `${KIND[stop.kind]} ${stop.position} of ${count}`
}

function where(stop: BrokerUpdateStop) {
  return [stop.facility, stop.location].filter(Boolean).join(", ")
}

export function brokerUpdateMessage(
  input: BrokerUpdateInput
): BrokerUpdateMessage {
  const { stop, event } = input
  const lines: string[] = []
  let mapUrl: string | null = null
  let subject: string

  if (event === "delivered" || !stop) {
    subject = `Load ${input.reference}: delivered`
    lines.push(
      stop
        ? `Delivered at ${where(stop)}.`
        : `Load ${input.reference} was delivered.`,
      `Time: ${formatUpdateTime(stop?.departed_at ?? stop?.arrived_at ?? input.at, input.timeZone)}`
    )
  } else {
    const verb = event === "arrived" ? "Arrived at" : "Left"
    const name = stopName(stop, input.stopCount)
    subject = `Load ${input.reference}: ${event === "arrived" ? "arrived at" : "left"} ${name}`
    lines.push(`${verb} ${name}: ${where(stop)}.`)
    if (stop.stop_number) {
      lines.push(
        `${stop.kind === "pickup" ? "Pickup" : "Delivery"} #: ${stop.stop_number}`
      )
    }
    const at = event === "arrived" ? stop.arrived_at : stop.departed_at
    lines.push(`Time: ${formatUpdateTime(at ?? input.at, input.timeZone)}`)
    const source =
      event === "arrived" ? stop.arrived_source : stop.departed_source
    const fix = source === "driver" ? place(stop, event) : null
    if (fix) {
      mapUrl = fix.url
      lines.push(
        `Driver's location${fix.accuracy ? ` (${fix.accuracy})` : ""}: ${fix.url}`
      )
    } else if (source === "office" || source === "eld") {
      lines.push(
        source === "eld" ? "Time from the ELD." : "Time entered by dispatch."
      )
    }
  }

  return { subject, lines, mapUrl }
}

/**
 * Who gets the update: the broker's dispatch contacts with an email, or
 * whoever sent the rate con when there are none. Lowercased, no repeats.
 */
export function updateRecipients(
  contacts: { role: string; email: string | null }[],
  rateConFrom: string | null
) {
  const dispatch = contacts
    .filter((contact) => contact.role === "dispatch" && contact.email)
    .map((contact) => contact.email!.trim().toLowerCase())
  const list = dispatch.length
    ? dispatch
    : rateConFrom
      ? [rateConFrom.trim().toLowerCase()]
      : []
  return [...new Set(list)].filter((email) => /^[^\s@]+@[^\s@]+$/.test(email))
}

/** What the load's history says about an update that went out. */
export function updateHistoryDetail(subject: string, to: string[]) {
  const what = subject.replace(/^Load [^:]+: /, "")
  return `Update sent to the broker: ${what} (${to.join(", ")})`
}
