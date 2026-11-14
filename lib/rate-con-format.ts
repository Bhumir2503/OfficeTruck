// Turns what was read off a rate con into starting values for the New Load
// form. Shared by server and client, with only type imports, so it can be
// tested on its own. Nothing here saves anything: a person checks the form
// and saves it.

import type { ChargeKind, EquipmentType, StopKind } from "./schemas/load"

/** What Claude reads off a rate con. Anything not on it is null or empty. */
export type RateConExtraction = {
  load_number: string | null
  reference_numbers: string[]
  broker_name: string | null
  broker_mc_number: string | null
  sender_email: string | null
  equipment: EquipmentType | null
  commodity: string | null
  weight_lbs: number | null
  trailer_number: string | null
  stops: {
    kind: StopKind
    address: string | null
    appointment_start: string | null
    appointment_end: string | null
    number: string | null
  }[]
  charges: {
    kind: ChargeKind
    description: string | null
    amount: number | null
  }[]
  detention_free_hours: number | null
  detention_hourly_rate: number | null
}

/** A broker in the organization's list, to match the rate con against. */
export type BrokerMatchOption = {
  id: string
  legal_name: string
  dba_name: string | null
  mc_number: string | null
}

/** The fields the form marks as filled in from the rate con. */
export type FilledField =
  | "reference"
  | "reference_numbers"
  | "equipment"
  | "commodity"
  | "weight_lbs"
  | "trailer_number"
  | "broker"
  | "rate_con_from"
  | "stops"
  | "charges"
  | "detention"

/** Starting values for the form. null means "leave that part as it is". */
export type RateConFill = {
  reference: string | null
  freight: {
    reference_numbers: string | null
    equipment: EquipmentType | null
    commodity: string | null
    weight_lbs: number | null
    trailer_number: string | null
  }
  broker: {
    brokerId: string | null
    brokerName: string
    sender: string | null
  } | null
  stops:
    | {
        kind: StopKind
        location?: string
        appointment_start?: string
        appointment_end?: string | null
        stop_number?: string | null
      }[]
    | null
  charges:
    | { kind: ChargeKind; description: string | null; amount: number | null }[]
    | null
  detention: { free_hours: number | null; rate: number | null } | null
  filled: FilledField[]
}

/** Trims text, turns blank into null, and cuts it to the form's limit. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const text = value.replace(/\s+/g, " ").trim()
  return text ? text.slice(0, max).trim() : null
}

const pad = (value: number) => String(value).padStart(2, "0")

function validParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0
) {
  return (
    year >= 2000 &&
    year <= 2100 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate() &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  )
}

/**
 * A rate con date and time as the form's wall-clock "YYYY-MM-DDTHH:mm", with
 * no time zone. A date with no time comes back as "YYYY-MM-DDT", so the form
 * shows the date and asks for the time instead of making one up. Returns null
 * for anything it can't read.
 *
 * Takes "2026-11-14T08:00", "2026-11-14 08:00:00", "2026-11-14T08:00-05:00"
 * (the zone is dropped; the time as written is the time at the stop),
 * "2026-11-14", "11/14/2026", "11/14/2026 8:00 AM" and "11/14/2026 14:30".
 */
export function toWallClock(value: unknown): string | null {
  if (typeof value !== "string") return null
  const text = value.trim()

  const iso = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i
  )
  const us = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]\.?M\.?)?)?$/i
  )
  let year: number, month: number, day: number
  let hour: number | null = null
  let minute: number | null = null
  if (iso) {
    ;[year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    if (iso[4] !== undefined) {
      hour = Number(iso[4])
      minute = Number(iso[5])
    }
  } else if (us) {
    ;[month, day, year] = [Number(us[1]), Number(us[2]), Number(us[3])]
    if (us[4] !== undefined) {
      hour = Number(us[4])
      minute = Number(us[5])
      const meridiem = us[6]?.toUpperCase().replaceAll(".", "")
      if (meridiem) {
        if (hour < 1 || hour > 12) return null
        hour = (hour % 12) + (meridiem === "PM" ? 12 : 0)
      }
    }
  } else {
    return null
  }

  if (!validParts(year, month, day, hour ?? 0, minute ?? 0)) return null
  const date = `${year}-${pad(month)}-${pad(day)}`
  return hour === null ? `${date}T` : `${date}T${pad(hour)}:${pad(minute!)}`
}

/** "MC-123456", "MC# 0123456" or "123456" → "123456", or null. */
export function cleanMc(value: unknown): string | null {
  if (typeof value !== "string") return null
  const digits = value.replace(/^\s*MC[-#:\s]*/i, "").replace(/\D/g, "")
  if (!digits || digits.length > 8) return null
  return digits.replace(/^0+(?=\d)/, "")
}

const NAME_ENDINGS =
  /\b(inc|incorporated|llc|l l c|ltd|limited|co|corp|corporation|company)\b/g

/** A company name for comparing: lowercase, no punctuation or "Inc."/"LLC". */
export function nameKey(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(NAME_ENDINGS, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * The broker in your list that the rate con is from: the same MC number
 * first, then the same legal or DBA name. null when none matches.
 */
export function matchBroker(
  brokers: BrokerMatchOption[],
  name: string | null,
  mc: string | null
): BrokerMatchOption | null {
  const cleanedMc = cleanMc(mc)
  if (cleanedMc) {
    const byMc = brokers.find(
      (broker) => broker.mc_number && cleanMc(broker.mc_number) === cleanedMc
    )
    if (byMc) return byMc
  }
  const key = name ? nameKey(name) : ""
  if (!key) return null
  return (
    brokers.find(
      (broker) =>
        nameKey(broker.legal_name) === key ||
        (broker.dba_name !== null && nameKey(broker.dba_name) === key)
    ) ?? null
  )
}

/** A dollar amount rounded to cents, or null if it isn't one the form takes. */
export function cleanAmount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  const cents = Math.round(value * 100) / 100
  return cents >= 0 && cents < 100_000_000 ? cents : null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Builds the form's starting values from what was read off the rate con. */
export function rateConToForm(
  extraction: RateConExtraction,
  brokers: BrokerMatchOption[]
): RateConFill {
  const filled: FilledField[] = []
  const mark = <T>(field: FilledField, value: T) => {
    if (value !== null) filled.push(field)
    return value
  }

  const reference = mark("reference", cleanText(extraction.load_number, 50))

  const referenceNumbers = (extraction.reference_numbers ?? [])
    .map((number) => cleanText(number, 200))
    .filter((number): number is string => number !== null)
  const weight =
    typeof extraction.weight_lbs === "number" &&
    Number.isFinite(extraction.weight_lbs) &&
    extraction.weight_lbs > 0
      ? Math.round(extraction.weight_lbs)
      : null
  const freight = {
    reference_numbers: mark(
      "reference_numbers",
      cleanText(referenceNumbers.join(", "), 200)
    ),
    equipment: mark("equipment", extraction.equipment ?? null),
    commodity: mark("commodity", cleanText(extraction.commodity, 120)),
    weight_lbs: mark(
      "weight_lbs",
      weight !== null && weight <= 200_000 ? weight : null
    ),
    trailer_number: mark(
      "trailer_number",
      cleanText(extraction.trailer_number, 30)
    ),
  }

  const email = cleanText(extraction.sender_email, 254)?.toLowerCase() ?? null
  const sender = email && EMAIL.test(email) ? email : null
  const brokerName = cleanText(extraction.broker_name, 120)
  const match = matchBroker(brokers, brokerName, extraction.broker_mc_number)
  let broker: RateConFill["broker"] = null
  if (match) {
    broker = {
      brokerId: match.id,
      brokerName: match.dba_name ?? match.legal_name,
      sender,
    }
  } else if (brokerName || sender) {
    broker = { brokerId: null, brokerName: brokerName ?? "", sender }
  }
  if (match || brokerName) filled.push("broker")
  if (sender) filled.push("rate_con_from")

  const stops = (extraction.stops ?? [])
    .map((stop) => {
      const start = toWallClock(stop.appointment_start)
      let end = toWallClock(stop.appointment_end)
      // An end with no time, or one that isn't after the start, is left for
      // the person rather than guessed at.
      if (end && (end.endsWith("T") || !start || end <= start)) end = null
      return {
        kind: stop.kind,
        location: cleanText(stop.address, 200) ?? undefined,
        appointment_start: start ?? undefined,
        appointment_end: end,
        stop_number: cleanText(stop.number, 50),
      }
    })
    .filter((stop) => stop.location || stop.appointment_start)
    .slice(0, 50)

  const charges = (extraction.charges ?? [])
    .map((charge) => ({
      kind: charge.kind,
      description: cleanText(charge.description, 120),
      amount: cleanAmount(charge.amount),
    }))
    .filter((charge) => charge.amount !== null)
    .slice(0, 20)

  const freeHours =
    typeof extraction.detention_free_hours === "number" &&
    extraction.detention_free_hours >= 0 &&
    extraction.detention_free_hours <= 48
      ? Math.round(extraction.detention_free_hours * 10) / 10
      : null
  const rate = cleanAmount(extraction.detention_hourly_rate)
  const detention =
    freeHours !== null || rate !== null ? { free_hours: freeHours, rate } : null

  return {
    reference,
    freight,
    broker,
    stops: mark("stops", stops.length ? stops : null),
    charges: mark("charges", charges.length ? charges : null),
    detention: mark("detention", detention),
    filled,
  }
}
