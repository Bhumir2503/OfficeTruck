import { cn } from "cn"
import { ReceiptText } from "lucide-react"
import Link from "next/link"

import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  balanceDue,
  brokerPaymentStats,
  formatInvoiceDate,
  invoiceState,
} from "@/lib/invoice-format"
import type { InvoiceListItem } from "@/lib/invoices"
import { formatRate } from "@/lib/load-format"

function Stat({
  label,
  value,
  detail,
  warning,
}: {
  label: string
  value: string
  detail: string
  warning?: boolean
}) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          warning && "text-destructive"
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

/**
 * How a broker pays: average days to pay against their terms, what's open
 * and overdue, the last payment, then each invoice.
 */
export function BrokerPaymentHistory({
  invoices,
  termsDays,
  today,
  invoicesBase,
}: {
  invoices: InvoiceListItem[]
  termsDays: number
  /** "YYYY-MM-DD" */
  today: string
  /** /org/<slug>/invoices */
  invoicesBase: string
}) {
  const stats = brokerPaymentStats(invoices, today)
  const expected =
    termsDays === 0
      ? "a few days of invoicing"
      : `${termsDays} ${termsDays === 1 ? "day" : "days"}`
  const slow =
    stats.avgDaysToPay !== null && stats.avgDaysToPay > Math.max(termsDays, 1)
  const shown = invoices.filter((invoice) => invoice.status !== "void")

  return (
    <SettingsCard
      title="Payment history"
      description={`Terms: paid within ${expected}.`}
      contentClassName={shown.length ? "px-0 pb-0" : undefined}
      footer={
        shown.length > 0 && (
          <SettingsCardFooter hint={plural(shown.length, "invoice")} />
        )
      }
    >
      {shown.length === 0 ? (
        <SettingsEmptyState icon={ReceiptText} title="No invoices yet">
          Average days to pay, open and overdue invoices, and the last payment
          show here once you invoice this broker.
        </SettingsEmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 px-6 pb-5 lg:grid-cols-4">
            <Stat
              label="Average days to pay"
              value={
                stats.avgDaysToPay === null
                  ? "—"
                  : `${stats.avgDaysToPay} ${stats.avgDaysToPay === 1 ? "day" : "days"}`
              }
              detail={
                stats.paidCount
                  ? `Over ${plural(stats.paidCount, "paid invoice")}${slow ? ", slower than terms" : ""}`
                  : "No paid invoices yet"
              }
              warning={slow}
            />
            <Stat
              label="Open"
              value={formatRate(stats.open.balance)}
              detail={plural(stats.open.count, "invoice")}
            />
            <Stat
              label="Overdue"
              value={formatRate(stats.overdue.balance)}
              detail={plural(stats.overdue.count, "invoice")}
              warning={stats.overdue.count > 0}
            />
            <Stat
              label="Last payment"
              value={
                stats.lastPayment ? formatRate(stats.lastPayment.amount) : "—"
              }
              detail={
                stats.lastPayment
                  ? formatInvoiceDate(stats.lastPayment.paid_on)
                  : "Nothing paid yet"
              }
            />
          </div>
          <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-px">Invoice</TableHead>
                <TableHead>Load</TableHead>
                <TableHead className="hidden sm:table-cell">Sent</TableHead>
                <TableHead className="text-right">Owed</TableHead>
                <TableHead className="w-px">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((invoice) => {
                const state = invoiceState(invoice, today)
                const owed =
                  invoice.status === "draft"
                    ? Number(invoice.load.rate)
                    : invoice.status === "sent"
                      ? balanceDue(invoice.total, invoice.paid_amount)
                      : 0
                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="py-3">
                      <Link
                        href={`${invoicesBase}/${invoice.id}`}
                        className="font-medium tabular-nums hover:underline"
                      >
                        #{invoice.number}
                      </Link>
                    </TableCell>
                    <TableCell>{invoice.load.reference}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {invoice.invoice_date
                        ? formatInvoiceDate(invoice.invoice_date)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {invoice.status === "paid" ? (
                        <span className="text-muted-foreground">
                          Paid {formatInvoiceDate(invoice.paid_on!)}
                        </span>
                      ) : (
                        formatRate(owed)
                      )}
                    </TableCell>
                    <TableCell>
                      <InvoiceStatusBadge state={state} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </>
      )}
    </SettingsCard>
  )
}
