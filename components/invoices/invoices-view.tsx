"use client"

import { cn } from "cn"
import {
  CheckCircle2,
  FilePlus2,
  Loader2,
  ReceiptText,
  Search,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { createInvoice } from "@/app/org/[slug]/invoices/actions"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  balanceDue,
  daysBetween,
  formatInvoiceDate,
  INVOICE_STATE_LABELS,
  invoiceState,
  type InvoiceState,
} from "@/lib/invoice-format"
import type { InvoiceListItem, ReadyLoad } from "@/lib/invoices"
import { DOCUMENT_LABELS } from "@/lib/load-document-format"
import { formatRate, formatStopDate } from "@/lib/load-format"

const FILTERS: InvoiceState[] = [
  "draft",
  "sent",
  "partial",
  "overdue",
  "paid",
  "void",
]

/** Sent and not paid off yet. */
const isOpen = (state: InvoiceState) =>
  state === "sent" || state === "partial" || state === "overdue"
type Filter = InvoiceState | "open" | "all"

/** What an invoice is for: its frozen total once sent, the load's rate while a draft. */
const amountOf = (invoice: InvoiceListItem) =>
  Number(invoice.total ?? invoice.load.rate)

function Stat({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone?: "warning"
}) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4 shadow-xs">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tracking-tight tabular-nums",
          tone === "warning" && "text-destructive"
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

const count = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

/**
 * The Invoices page: what's waiting to be billed, then every invoice by
 * where it stands.
 */
export function InvoicesView({
  organizationId,
  invoices,
  ready,
  today,
  base,
  loadsBase,
}: {
  organizationId: string
  invoices: InvoiceListItem[]
  ready: ReadyLoad[]
  /** "YYYY-MM-DD", from the server so the render matches. */
  today: string
  /** /org/<slug>/invoices */
  base: string
  /** /org/<slug>/loads */
  loadsBase: string
}) {
  const router = useRouter()
  const [creating, setCreating] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("all")

  const rows = useMemo(
    () =>
      invoices.map((invoice) => ({
        invoice,
        state: invoiceState(invoice, today),
      })),
    [invoices, today]
  )

  const totals = useMemo(() => {
    // What's still owed, not the whole invoice, once some has come in.
    const owed = (list: typeof rows) =>
      list.reduce(
        (total, row) =>
          total + balanceDue(row.invoice.total, row.invoice.paid_amount),
        0
      )
    const open = rows.filter((row) => isOpen(row.state))
    const overdue = rows.filter((row) => row.state === "overdue")
    // Every payment in the last 30 days, part payments included.
    const recent = rows.flatMap(({ invoice }) =>
      invoice.payments
        .filter((payment) => daysBetween(payment.paid_on, today) <= 30)
        .map((payment) => ({ invoice: invoice.id, amount: payment.amount }))
    )
    return {
      ready: ready.reduce((total, load) => total + Number(load.rate), 0),
      open: { n: open.length, amount: owed(open) },
      overdue: { n: overdue.length, amount: owed(overdue) },
      paid: {
        n: new Set(recent.map((payment) => payment.invoice)).size,
        amount: recent.reduce(
          (total, payment) => total + Number(payment.amount),
          0
        ),
      },
      byState: Object.fromEntries(
        FILTERS.map((state) => [
          state,
          rows.filter((row) => row.state === state).length,
        ])
      ) as Record<InvoiceState, number>,
    }
  }, [rows, ready, today])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter(
      ({ invoice, state }) =>
        (filter === "all" ||
          (filter === "open" ? isOpen(state) : state === filter)) &&
        (String(invoice.number).includes(query) ||
          invoice.load.reference.toLowerCase().includes(query) ||
          invoice.load.broker_name.toLowerCase().includes(query))
    )
  }, [rows, filter, search])

  async function create(load: ReadyLoad) {
    setCreating(load.id)
    const result = await createInvoice(organizationId, load.id)
    if ("error" in result) {
      setCreating(null)
      toast.error(result.error)
      return
    }
    router.push(`${base}/${result.id}`)
  }

  const filtering = search.trim() !== "" || filter !== "all"

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Ready to invoice"
          value={formatRate(totals.ready)}
          detail={count(ready.length, "load")}
        />
        <Stat
          label="Waiting on pay"
          value={formatRate(totals.open.amount)}
          detail={count(totals.open.n, "invoice")}
        />
        <Stat
          label="Overdue"
          value={formatRate(totals.overdue.amount)}
          detail={count(totals.overdue.n, "invoice")}
          tone={totals.overdue.n ? "warning" : undefined}
        />
        <Stat
          label="Paid, last 30 days"
          value={formatRate(totals.paid.amount)}
          detail={count(totals.paid.n, "invoice")}
        />
      </div>

      <SettingsCard
        title="Ready to invoice"
        description="Delivered and TONU loads with no invoice yet. Make a draft, check it, then send it with the paperwork attached."
        contentClassName={ready.length ? "@container px-0 pb-0" : undefined}
        footer={
          ready.length > 0 && (
            <SettingsCardFooter hint={count(ready.length, "load")} />
          )
        }
      >
        {ready.length === 0 ? (
          <SettingsEmptyState icon={CheckCircle2} title="Nothing to bill">
            Loads show up here once they&apos;re delivered.
          </SettingsEmptyState>
        ) : (
          <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-full">Load</TableHead>
                <TableHead className="hidden w-px @2xl:table-cell">
                  Delivered
                </TableHead>
                <TableHead className="hidden w-px @xl:table-cell">
                  Paperwork
                </TableHead>
                <TableHead className="w-px text-right">Amount</TableHead>
                <TableHead className="w-px text-right">
                  <span className="sr-only">Action</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ready.map((load) => (
                <TableRow key={load.id}>
                  <TableCell className="max-w-0 py-3">
                    <Link
                      href={`${loadsBase}/${load.id}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {load.reference}
                      {load.status === "tonu" && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          TONU
                        </span>
                      )}
                    </Link>
                    <div className="truncate text-sm text-muted-foreground">
                      {load.broker_name}
                    </div>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground @2xl:table-cell">
                    {formatStopDate(load.delivery_start)}
                  </TableCell>
                  <TableCell className="hidden text-sm whitespace-nowrap @xl:table-cell">
                    {load.missing.length === 0 ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" />
                        All in
                      </span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400">
                        Missing{" "}
                        {load.missing
                          .map((kind) => DOCUMENT_LABELS[kind])
                          .join(", ")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatRate(load.rate)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={load.missing.length ? "outline" : "default"}
                      className="whitespace-nowrap"
                      disabled={creating !== null}
                      onClick={() => void create(load)}
                    >
                      {creating === load.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <FilePlus2 />
                      )}
                      Create invoice
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SettingsCard>

      <SettingsCard
        title="Invoices"
        description="Search by invoice number, load number or broker."
        contentClassName={invoices.length ? "@container px-0 pb-0" : undefined}
        footer={
          invoices.length > 0 && (
            <SettingsCardFooter
              hint={
                filtering
                  ? `Showing ${filtered.length} of ${count(invoices.length, "invoice")}`
                  : count(invoices.length, "invoice")
              }
            />
          )
        }
      >
        {invoices.length === 0 ? (
          <SettingsEmptyState icon={ReceiptText} title="No invoices yet">
            Create one from a delivered load above. It gets your next invoice
            number and goes out with the rate con, BOL and POD attached.
          </SettingsEmptyState>
        ) : (
          <>
            <div className="flex flex-col gap-3 px-6 pb-4">
              <div className="relative w-full">
                <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search invoice #, load # or broker"
                  aria-label="Search invoices"
                  className="pl-7"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <ToggleGroup
                aria-label="Filter by status"
                variant="outline"
                size="sm"
                spacing={1}
                className="flex-wrap"
                value={[filter]}
                onValueChange={(value: string[]) =>
                  setFilter((value[0] as Filter | undefined) ?? "all")
                }
              >
                <ToggleGroupItem value="all">
                  All {invoices.length}
                </ToggleGroupItem>
                {FILTERS.map((state) => (
                  <ToggleGroupItem key={state} value={state}>
                    {INVOICE_STATE_LABELS[state]}
                    <span className="text-muted-foreground tabular-nums">
                      {totals.byState[state]}
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-px">Invoice</TableHead>
                  <TableHead className="w-full">Load</TableHead>
                  <TableHead className="hidden w-px @2xl:table-cell">
                    Sent
                  </TableHead>
                  <TableHead className="hidden w-px @xl:table-cell">
                    Due
                  </TableHead>
                  <TableHead className="w-px text-right">Amount</TableHead>
                  <TableHead className="w-px">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No invoices match your search.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map(({ invoice, state }) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="py-3">
                      <Link
                        href={`${base}/${invoice.id}`}
                        className="font-medium tabular-nums hover:underline"
                      >
                        #{invoice.number}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-0">
                      <div className="truncate">{invoice.load.reference}</div>
                      <div className="truncate text-sm text-muted-foreground">
                        {invoice.load.broker_name}
                      </div>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground @2xl:table-cell">
                      {invoice.invoice_date
                        ? formatInvoiceDate(invoice.invoice_date)
                        : "—"}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap @xl:table-cell">
                      {state === "overdue" && invoice.due_on ? (
                        <span className="font-medium text-destructive">
                          {count(daysBetween(invoice.due_on, today), "day")}{" "}
                          late
                          {Number(invoice.paid_amount) > 0 &&
                            ` · ${formatRate(balanceDue(invoice.total, invoice.paid_amount))} left`}
                        </span>
                      ) : state === "partial" ? (
                        <span className="text-muted-foreground">
                          {formatRate(
                            balanceDue(invoice.total, invoice.paid_amount)
                          )}{" "}
                          left
                          {invoice.due_on &&
                            ` · due ${formatInvoiceDate(invoice.due_on)}`}
                        </span>
                      ) : state === "paid" && invoice.paid_on ? (
                        <span className="text-muted-foreground">
                          Paid {formatInvoiceDate(invoice.paid_on)}
                        </span>
                      ) : invoice.due_on && state === "sent" ? (
                        <span className="text-muted-foreground">
                          {formatInvoiceDate(invoice.due_on)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRate(amountOf(invoice))}
                    </TableCell>
                    <TableCell>
                      <InvoiceStatusBadge state={state} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </SettingsCard>
    </div>
  )
}
