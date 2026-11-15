import type { FactoringCompany } from "@/lib/factoring-format"
import type { InvoiceMethod } from "@/lib/schemas/broker"
import type { ChargeKind } from "@/lib/schemas/load"

// Shared by server and client: no server-only imports here. Keep in step
// with the checks on public.invoices.

export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

/** What the list shows: a sent invoice past its due date is overdue. */
export type InvoiceState = InvoiceStatus | "overdue"

export const INVOICE_STATE_LABELS: Record<InvoiceState, string> = {
  draft: "Draft",
  sent: "Sent",
  overdue: "Overdue",
  paid: "Paid",
  void: "Void",
}

export const INVOICE_STATE_STYLES: Record<InvoiceState, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  overdue: "bg-red-500/10 text-red-700 dark:text-red-300",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  void: "bg-muted text-muted-foreground line-through",
}

export type SentVia = "email" | "portal" | "other"

export const SENT_VIA_LABELS: Record<SentVia, string> = {
  email: "Emailed from OfficeTruck",
  portal: "Uploaded to their portal",
  other: "Sent another way",
}

export type InvoiceLine = {
  kind: ChargeKind
  description: string | null
  amount: number
}

/** Today as "YYYY-MM-DD" in local time. */
export function localToday(today = new Date()) {
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")
  return `${today.getFullYear()}-${month}-${day}`
}

/** A sent invoice is overdue the day after it's due. */
export function invoiceState(
  invoice: { status: InvoiceStatus; due_on: string | null },
  today: string
): InvoiceState {
  if (invoice.status === "sent" && invoice.due_on && invoice.due_on < today) {
    return "overdue"
  }
  return invoice.status
}

/** Whole days from `from` to `to`, both "YYYY-MM-DD". */
export function daysBetween(from: string, to: string) {
  const utc = (value: string) =>
    Date.UTC(
      Number(value.slice(0, 4)),
      Number(value.slice(5, 7)) - 1,
      Number(value.slice(8, 10))
    )
  return Math.round((utc(to) - utc(from)) / (24 * 60 * 60 * 1000))
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

/** "2026-11-15" → "Nov 15, 2026" */
export function formatInvoiceDate(value: string) {
  return dateFormat.format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
}

/** "Net 30", or "Due on receipt" for 0 days. */
export function formatTerms(days: number) {
  return days === 0 ? "Due on receipt" : `Net ${days}`
}

/** Address parts as lines, skipping blanks: ["12 Main St", "Dallas, TX 75201"]. */
export function addressLines(parts: {
  line1?: string | null
  line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
}) {
  const cityLine = [
    [parts.city, parts.state].filter(Boolean).join(", "),
    parts.postal_code,
  ]
    .filter(Boolean)
    .join(" ")
  return [parts.line1, parts.line2, cityLine].filter(
    (line): line is string => !!line && line.trim() !== ""
  )
}

/** Who the invoice goes to and how. */
export type BillTo = {
  /** factoring: the broker's loads are factored, so the packet goes to the factoring company. */
  kind: "broker" | "factoring"
  name: string
  method: InvoiceMethod
  emails: string[]
  portal_url: string | null
}

export type BillingBroker = {
  legal_name: string
  invoice_method: InvoiceMethod
  billing_emails: string[]
  portal_url: string | null
  factored: boolean
}

/**
 * Where the packet goes: the factoring company when the broker's loads are
 * factored and one is set up, otherwise the broker. A load with no linked
 * broker has nowhere on file, so it's emailed to whoever's typed in.
 */
export function billTo(
  brokerName: string,
  broker: BillingBroker | null,
  factoring: FactoringCompany | null
): BillTo {
  if (broker?.factored && factoring) {
    return {
      kind: "factoring",
      name: factoring.name,
      method: factoring.submission_method,
      emails: factoring.submission_emails,
      portal_url: factoring.portal_url,
    }
  }
  return {
    kind: "broker",
    name: broker?.legal_name ?? brokerName,
    method: broker?.invoice_method ?? "email",
    emails: broker?.billing_emails ?? [],
    portal_url: broker?.portal_url ?? null,
  }
}

/** "Invoice 1001" */
export function invoiceTitle(number: number) {
  return `Invoice ${number}`
}

/** A file-name-safe packet name: "Invoice-1001-Load-ABC123.pdf". */
export function packetFileName(number: number, reference: string) {
  const safe = reference.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-|-$/g, "")
  return `Invoice-${number}${safe ? `-Load-${safe}` : ""}.pdf`
}
