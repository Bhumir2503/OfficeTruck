import { cn } from "cn"

import { LocalDate } from "@/components/local-date"
import {
  balanceDue,
  dueDistance,
  formatInvoiceDate,
  formatTerms,
  type InvoiceState,
  SENT_VIA_LABELS,
} from "@/lib/invoice-format"
import type { Invoice } from "@/lib/invoices"
import { formatRate } from "@/lib/load-format"

function Figure({
  label,
  value,
  detail,
  tone,
  emphasis,
}: {
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  tone?: "late" | "done" | "muted"
  emphasis?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card px-4 py-3.5 sm:px-5 sm:py-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "truncate font-semibold tabular-nums",
          emphasis
            ? "text-xl tracking-tight sm:text-2xl"
            : "text-base sm:text-lg",
          tone === "late" && "text-destructive",
          tone === "done" && "text-emerald-700 dark:text-emerald-400",
          tone === "muted" && "text-muted-foreground line-through"
        )}
      >
        {value}
      </dd>
      {detail && (
        <dd className="truncate text-xs text-muted-foreground">{detail}</dd>
      )}
    </div>
  )
}

/**
 * The invoice's numbers at a glance, above the page: what's still owed,
 * what it was for, when it's due and how it went out.
 */
export function InvoiceSummary({
  invoice,
  state,
  total,
  dueOn,
  today,
}: {
  invoice: Invoice
  state: InvoiceState
  /** The invoice total: frozen once sent, the load's charges on a draft. */
  total: number
  /** "YYYY-MM-DD": the due date, or what it would be if sent today. */
  dueOn: string
  today: string
}) {
  const paid = Number(invoice.paid_amount ?? 0)
  const owed = balanceDue(total, paid)
  const sentTo = invoice.sent_to ?? []

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border shadow-xs xl:grid-cols-4">
      {state === "draft" ? (
        <Figure
          label="Total"
          value={formatRate(total)}
          detail="Not billed yet"
          emphasis
        />
      ) : state === "void" ? (
        <Figure
          label="Voided"
          value={formatRate(total)}
          detail="Nothing is owed on it"
          tone="muted"
          emphasis
        />
      ) : state === "paid" ? (
        <Figure
          label="Balance due"
          value={formatRate(0)}
          detail="Paid in full"
          tone="done"
          emphasis
        />
      ) : (
        <Figure
          label="Balance due"
          value={formatRate(owed)}
          detail={
            paid > 0 ? `${formatRate(paid)} paid so far` : "Nothing paid yet"
          }
          tone={state === "overdue" ? "late" : undefined}
          emphasis
        />
      )}
      <Figure
        label="Invoice total"
        value={formatRate(total)}
        detail={formatTerms(invoice.terms_days)}
      />
      {state === "paid" && invoice.paid_on ? (
        <Figure
          label="Paid"
          value={formatInvoiceDate(invoice.paid_on)}
          detail={`Was due ${formatInvoiceDate(dueOn)}`}
        />
      ) : (
        <Figure
          label="Due"
          value={formatInvoiceDate(dueOn)}
          detail={
            state === "draft"
              ? "If it's sent today"
              : state === "void"
                ? undefined
                : `Due ${dueDistance(dueOn, today)}`
          }
          tone={state === "overdue" ? "late" : undefined}
        />
      )}
      <Figure
        label="Sent"
        value={
          invoice.sent_at ? (
            <LocalDate value={invoice.sent_at} />
          ) : (
            "Not sent yet"
          )
        }
        detail={
          invoice.sent_at && invoice.sent_via
            ? `${SENT_VIA_LABELS[invoice.sent_via]}${
                sentTo.length
                  ? ` to ${sentTo[0]}${sentTo.length > 1 ? ` and ${sentTo.length - 1} more` : ""}`
                  : ""
              }`
            : "Check it over, then send it"
        }
      />
    </dl>
  )
}
