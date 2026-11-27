import { cn } from "cn"

import { LocalDate } from "@/components/local-date"
import { formatInvoiceDate, SENT_VIA_LABELS } from "@/lib/invoice-format"
import type { Invoice, InvoicePayment } from "@/lib/invoices"
import { formatRate } from "@/lib/load-format"

type Entry = {
  key: string
  /** When it happened, to put the entries in order: ISO. */
  at: string
  title: string
  detail?: string
  /** The day to show: a moment (shown in the viewer's zone) or a calendar date. */
  day: React.ReactNode
  tone?: "good" | "bad"
}

/**
 * What's happened to the invoice, newest first: made, sent, reminded, paid
 * (in parts, if it was), voided.
 */
export function InvoiceActivity({
  invoice,
  payments,
}: {
  invoice: Invoice
  payments: InvoicePayment[]
}) {
  const entries: Entry[] = [
    {
      key: "created",
      at: invoice.created_at,
      title: "Draft created",
      day: <LocalDate value={invoice.created_at} />,
    },
  ]
  if (invoice.sent_at) {
    const to = invoice.sent_to ?? []
    entries.push({
      key: "sent",
      at: invoice.sent_at,
      title: "Sent",
      detail: `${invoice.sent_via ? SENT_VIA_LABELS[invoice.sent_via] : ""}${to.length ? ` to ${to.join(", ")}` : ""}`,
      day: <LocalDate value={invoice.sent_at} />,
    })
  }
  if (invoice.reminder_count > 0 && invoice.last_reminded_at) {
    entries.push({
      key: "reminder",
      at: invoice.last_reminded_at,
      title:
        invoice.reminder_count === 1
          ? "Reminder sent"
          : `Reminder sent (${invoice.reminder_count} so far)`,
      day: <LocalDate value={invoice.last_reminded_at} />,
    })
  }
  for (const payment of payments) {
    entries.push({
      key: `payment-${payment.id}`,
      at: payment.created_at,
      title: `Payment of ${formatRate(payment.amount)}`,
      detail: payment.reference ?? undefined,
      day: formatInvoiceDate(payment.paid_on),
      tone: "good",
    })
  }
  if (invoice.voided_at) {
    entries.push({
      key: "voided",
      at: invoice.voided_at,
      title: "Voided",
      detail: invoice.void_reason ?? undefined,
      day: <LocalDate value={invoice.voided_at} />,
      tone: "bad",
    })
  }
  entries.sort((a, b) => b.at.localeCompare(a.at))

  return (
    <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
      <h4 className="px-5 pt-4 font-semibold">Activity</h4>
      <ol className="px-5 pt-3 pb-4">
        {entries.map((entry, index) => (
          <li key={entry.key} className="relative flex gap-3 pb-4 last:pb-0">
            {index < entries.length - 1 && (
              <span
                aria-hidden
                className="absolute top-3 bottom-0 left-[4.5px] w-px bg-border"
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-card ring-1",
                entry.tone === "good"
                  ? "bg-emerald-500 ring-emerald-500"
                  : entry.tone === "bad"
                    ? "bg-destructive ring-destructive"
                    : "bg-muted-foreground/40 ring-border"
              )}
            />
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{entry.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {entry.day}
                </span>
              </div>
              {entry.detail && (
                <p className="break-words text-muted-foreground">
                  {entry.detail}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
