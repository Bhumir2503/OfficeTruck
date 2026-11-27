"use client"

import { CheckCircle2, FilePlus2, Loader2, ReceiptText } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { createInvoice } from "@/app/org/[slug]/invoices/actions"
import { ListPager, usePage } from "@/components/dashboard/list-pager"
import { InvoiceRowAction } from "@/components/invoices/invoice-row-action"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { TableFilters, type FilterOption } from "@/components/table-filters"
import { Button } from "@/components/ui/button"
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

  // How many invoices each status filter shows.
  const totals = useMemo(
    () => ({
      byState: Object.fromEntries(
        FILTERS.map((state) => [
          state,
          rows.filter((row) => row.state === state).length,
        ])
      ) as Record<InvoiceState, number>,
    }),
    [rows]
  )

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
  // A page at a time: a company bills hundreds of loads a year.
  const { shown, pager } = usePage(filtered, 50)

  // The status filter's choices, each with how many invoices it shows.
  const filterOptions: FilterOption<Filter>[] = [
    { value: "all", name: "All", count: invoices.length },
    ...FILTERS.map((state) => ({
      value: state,
      name: INVOICE_STATE_LABELS[state],
      count: totals.byState[state],
    })),
  ]

  return (
    <div className="flex flex-col gap-6">
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
                    {formatStopDate(
                      load.delivered_on
                        ? `${load.delivered_on}T00:00:00`
                        : load.delivery_start
                    )}
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
            <ListPager
              {...pager}
              noun={
                filtering
                  ? `matching invoices (${invoices.length} in all)`
                  : pager.total === 1
                    ? "invoice"
                    : "invoices"
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
            <TableFilters
              search={search}
              onSearchChange={(value) => {
                setSearch(value)
                pager.onPage(1)
              }}
              searchPlaceholder="Search invoice #, load # or broker"
              searchLabel="Search invoices"
              filter={filter}
              onFilterChange={(value) => {
                setFilter(value)
                pager.onPage(1)
              }}
              options={filterOptions}
            />
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
                  <TableHead className="w-px @max-xl:pr-6">Status</TableHead>
                  <TableHead className="hidden w-px text-right @xl:table-cell">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No invoices match your search.
                    </TableCell>
                  </TableRow>
                )}
                {shown.map(({ invoice, state }) => (
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
                    <TableCell className="@max-xl:pr-6">
                      <InvoiceStatusBadge state={state} />
                    </TableCell>
                    <TableCell className="hidden text-right text-sm @xl:table-cell">
                      <InvoiceRowAction
                        organizationId={organizationId}
                        invoice={invoice}
                        state={state}
                        href={`${base}/${invoice.id}`}
                        today={today}
                      />
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
