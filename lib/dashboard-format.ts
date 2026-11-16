import type { ComplianceItem } from "@/lib/driver-format"
import type { InvoiceStatus } from "@/lib/invoice-format"
import type { LoadStatus } from "@/lib/schemas/load"

/*
 * The dashboard's to-do list: one line per thing the owner should act on,
 * most pressing first. The counts on the action cards and the sidebar badge
 * come from the same list, so they always agree with it.
 */

export type AttentionKind =
  "overdue" | "document" | "needs_driver" | "pod" | "invoice_ready"

export type AttentionItem = {
  /** Unique in the list. */
  key: string
  kind: AttentionKind
  /** "danger" is late already; "warning" is close; "default" is routine. */
  tone: "danger" | "warning" | "default"
  title: string
  detail: string
  /** Below /org/<slug>, e.g. "invoices/<id>"; null when there's no page. */
  path: string | null
}

/** How many loads to look ahead for when warning about missing drivers. */
export const NEEDS_DRIVER_DAYS = 3

export type AttentionInput = {
  /** "YYYY-MM-DD" */
  today: string
  invoices: {
    id: string
    number: number
    status: InvoiceStatus
    due_on: string | null
    total: number | string | null
    paid_amount: number | string | null
    load: { reference: string; broker_name: string; rate: number | string }
  }[]
  /** Delivered or TONU loads with no invoice yet. */
  ready: {
    id: string
    reference: string
    broker_name: string
    rate: number | string
    status: LoadStatus
    /** Wall-clock time, "YYYY-MM-DDTHH:mm:ss". */
    delivery_start: string
    missing: string[]
  }[]
  /** Booked loads, for the ones still missing a driver or truck. */
  booked: {
    id: string
    reference: string
    pickup_location: string
    /** Wall-clock time, "YYYY-MM-DDTHH:mm:ss". */
    pickup_start: string
    driver_id: string | null
    truck_id: string | null
  }[]
  /** Compliance dates for active drivers and trucks, and the company 2290. */
  documents: {
    owner: string
    item: ComplianceItem
    path: string | null
  }[]
}

const DAY = 86_400_000
const utc = (date: string) =>
  Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10))
  )
/** Whole days from `from` to `to`, both starting "YYYY-MM-DD". */
export const daysFrom = (from: string, to: string) =>
  Math.round((utc(to) - utc(from)) / DAY)

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})
const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})
const dateOf = (value: string) =>
  shortDate.format(new Date(`${value.slice(0, 10)}T00:00:00Z`))

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`
const possessive = (name: string) =>
  name.endsWith("s") ? `${name}’` : `${name}’s`

/** "Medical card" → "medical card", but "CDL" stays "CDL". */
const lowerFirst = (label: string) =>
  /^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label

/** "today", "tomorrow", "in 3 days", "yesterday", "2 days ago". */
export function relativeDay(days: number) {
  if (days === 0) return "today"
  if (days === 1) return "tomorrow"
  if (days === -1) return "yesterday"
  return days > 0 ? `in ${days} days` : `${-days} days ago`
}

/** Which documents count as "expiring soon": late, or due within 30 days. */
const SOON = new Set(["expired", "urgent", "soon"])

const TONE_RANK = { danger: 0, warning: 1, default: 2 }

export function buildAttention(input: AttentionInput): AttentionItem[] {
  const { today } = input
  const items: (AttentionItem & { urgency: number })[] = []

  for (const invoice of input.invoices) {
    const total = Number(invoice.total ?? invoice.load.rate)
    const left = Math.max(0, total - Number(invoice.paid_amount ?? 0))
    if (invoice.status === "sent" && invoice.due_on && invoice.due_on < today) {
      if (left <= 0) continue
      const late = daysFrom(invoice.due_on, today)
      items.push({
        key: `overdue:${invoice.id}`,
        kind: "overdue",
        tone: "danger",
        title: `Invoice #${invoice.number} is ${plural(late, "day")} overdue`,
        detail: `${invoice.load.broker_name} · ${usd.format(left)} left to pay`,
        path: `invoices/${invoice.id}`,
        urgency: -late,
      })
    } else if (invoice.status === "draft") {
      items.push({
        key: `draft:${invoice.id}`,
        kind: "invoice_ready",
        tone: "default",
        title: `Draft invoice #${invoice.number} is ready to send`,
        detail: `${invoice.load.reference} · ${invoice.load.broker_name} · ${usd.format(total)}`,
        path: `invoices/${invoice.id}`,
        urgency: 0,
      })
    }
  }

  for (const load of input.ready) {
    const ago = daysFrom(load.delivery_start, today)
    const delivered =
      load.status === "tonu" ? "TONU" : `Delivered ${relativeDay(-ago)}`
    if (load.missing.includes("pod")) {
      items.push({
        key: `pod:${load.id}`,
        kind: "pod",
        tone: ago >= 3 ? "danger" : "warning",
        title: `${load.reference} needs its POD`,
        detail: `${delivered} · ${load.broker_name}`,
        path: `loads/${load.id}`,
        urgency: -ago,
      })
    } else if (load.missing.length === 0) {
      items.push({
        key: `ready:${load.id}`,
        kind: "invoice_ready",
        tone: "default",
        title: `${load.reference} is ready to invoice`,
        detail: `${delivered} · ${load.broker_name} · ${usd.format(Number(load.rate))}`,
        path: `loads/${load.id}`,
        urgency: -ago,
      })
    }
  }

  for (const load of input.booked) {
    if (load.driver_id && load.truck_id) continue
    const days = daysFrom(today, load.pickup_start)
    if (days > NEEDS_DRIVER_DAYS) continue
    const what =
      !load.driver_id && !load.truck_id
        ? "a driver and truck"
        : !load.driver_id
          ? "a driver"
          : "a truck"
    items.push({
      key: `driver:${load.id}`,
      kind: "needs_driver",
      tone: days < 0 ? "danger" : days <= 1 ? "warning" : "default",
      title: `${load.reference} needs ${what}`,
      detail: `Pickup ${days < 0 ? `was ${dateOf(load.pickup_start)}` : `${relativeDay(days)}, ${dateOf(load.pickup_start)}`} · ${load.pickup_location}`,
      path: `loads/${load.id}`,
      urgency: days,
    })
  }

  for (const { owner, item, path } of input.documents) {
    const { expiry } = item
    if (expiry.state === "missing" || !SOON.has(expiry.state)) continue
    const late = expiry.state === "expired"
    const verb =
      item.kind === "expires"
        ? late
          ? "expired"
          : "expires"
        : late
          ? "is overdue"
          : "is due"
    const when = late
      ? `${dateOf(item.due!)}, ${plural(expiry.days, "day")} ago`
      : `${relativeDay(expiry.days)}, ${dateOf(item.due!)}`
    items.push({
      key: `document:${path ?? owner}:${item.key}`,
      kind: "document",
      tone: late ? "danger" : expiry.state === "urgent" ? "warning" : "default",
      title:
        owner === "Company"
          ? `The ${item.label} ${verb}`
          : `${possessive(owner)} ${lowerFirst(item.label)} ${verb}`,
      detail: late ? `Was due ${when}` : `Due ${when}`,
      path,
      urgency: late ? -expiry.days : expiry.days,
    })
  }

  return items
    .sort(
      (a, b) =>
        TONE_RANK[a.tone] - TONE_RANK[b.tone] ||
        a.urgency - b.urgency ||
        a.title.localeCompare(b.title)
    )
    .map((item) => {
      const { urgency, ...rest } = item
      void urgency
      return rest
    })
}

export type ActionCounts = Record<AttentionKind, number>

export function countActions(items: AttentionItem[]): ActionCounts {
  const counts: ActionCounts = {
    overdue: 0,
    document: 0,
    needs_driver: 0,
    pod: 0,
    invoice_ready: 0,
  }
  for (const item of items) counts[item.kind]++
  return counts
}

export function totalActions(counts: ActionCounts) {
  return Object.values(counts).reduce((sum, count) => sum + count, 0)
}
