"use client"

import { cn } from "cn"
import { ChartColumn, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { usePeriod } from "@/components/dashboard/period-context"
import {
  SettingsCard,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatRate, formatStopDate } from "@/lib/load-format"
import {
  breakdown,
  BREAKDOWN_LABELS,
  BREAKDOWNS,
  formatDollars,
  formatMiles,
  formatPercent,
  formatPerMile,
  inOverview,
  loadProfit,
  totals,
  type Breakdown,
  type BreakdownRow,
  type OverviewPeriod,
  type ReportLoad,
} from "@/lib/report-format"

const TABLE =
  "[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6"

const count = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

/** How the card's description names each period. */
const PERIOD_TEXT: Record<OverviewPeriod, string> = {
  "30days": "the last 5 weeks",
  "3months": "the last 13 weeks",
  "1year": "the last 12 months",
}

type View = "breakdown" | "loads"
type LoadSort = "newest" | "least" | "most"
const SORT_LABELS: Record<LoadSort, string> = {
  newest: "Newest",
  least: "Least profitable",
  most: "Most profitable",
}

const recordPath: Record<Breakdown, string | null> = {
  truck: "equipment",
  driver: "drivers",
  broker: "customers",
  lane: null,
}

/** A dropdown beside the tabs, for the table that's showing. */
function Picker<T extends string>({
  label,
  value,
  onChange,
  items,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  items: { value: T; label: string }[]
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next as T)
      }}
      items={items}
    >
      <SelectTrigger size="sm" aria-label={label} className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Where the money comes from, most profitable first. */
function BreakdownTable({
  loads,
  by,
  orgBase,
}: {
  loads: ReportLoad[]
  by: Breakdown
  orgBase: string
}) {
  const rows = useMemo(() => breakdown(loads, by), [loads, by])
  const path = recordPath[by]

  const name = (row: BreakdownRow) =>
    path && row.id ? (
      <Link
        href={`${orgBase}/${path}/${row.id}`}
        className="font-medium hover:underline"
      >
        {row.name}
      </Link>
    ) : (
      <span
        className={cn(
          "font-medium",
          !row.id && by !== "lane" && "text-muted-foreground"
        )}
      >
        {row.name}
      </span>
    )

  return (
    <Table className={TABLE}>
      <TableHeader className="bg-muted/40">
        <TableRow>
          <TableHead className="w-full">{BREAKDOWN_LABELS[by]}</TableHead>
          <TableHead className="text-right">Loads</TableHead>
          <TableHead className="text-right">Revenue</TableHead>
          <TableHead className="hidden text-right @2xl:table-cell">
            Miles
          </TableHead>
          <TableHead className="hidden text-right @xl:table-cell">
            Rate / mi
          </TableHead>
          <TableHead className="hidden text-right @3xl:table-cell">
            Cost / mi
          </TableHead>
          <TableHead className="hidden text-right @3xl:table-cell">
            Empty
          </TableHead>
          <TableHead className="text-right">Profit</TableHead>
          <TableHead className="hidden text-right @lg:table-cell">
            Margin
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="max-w-0 truncate">{name(row)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {row.loads}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatDollars(row.revenue)}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums @2xl:table-cell">
              {formatMiles(row.loadedMiles)}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums @xl:table-cell">
              {formatPerMile(row.ratePerMile)}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums @3xl:table-cell">
              {formatPerMile(row.costPerMile)}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums @3xl:table-cell">
              {formatPercent(row.emptyShare)}
            </TableCell>
            <TableCell
              className={cn(
                "text-right font-medium tabular-nums",
                row.profit < 0 && "text-destructive"
              )}
            >
              {formatDollars(row.profit)}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums @lg:table-cell">
              {formatPercent(row.margin)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

const PAGE = 25

/** What each load paid, what it cost to run, and what was left. */
function LoadsTable({
  loads,
  sort,
  loadsBase,
}: {
  loads: ReportLoad[]
  sort: LoadSort
  loadsBase: string
}) {
  const [showAll, setShowAll] = useState(false)
  const sorted = useMemo(() => {
    const list = [...loads]
    if (sort === "least") list.sort((a, b) => loadProfit(a) - loadProfit(b))
    if (sort === "most") list.sort((a, b) => loadProfit(b) - loadProfit(a))
    return list
  }, [loads, sort])
  const shown = showAll ? sorted : sorted.slice(0, PAGE)

  return (
    <>
      <Table className={TABLE}>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="w-full">Load</TableHead>
            <TableHead className="hidden w-px @2xl:table-cell">
              Delivered
            </TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="hidden text-right @xl:table-cell">
              Driver pay
            </TableHead>
            <TableHead className="hidden text-right @xl:table-cell">
              Expenses
            </TableHead>
            <TableHead className="hidden text-right @3xl:table-cell">
              Rate / mi
            </TableHead>
            <TableHead className="text-right">Profit</TableHead>
            <TableHead className="hidden text-right @lg:table-cell">
              Margin
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((load) => {
            const profit = loadProfit(load)
            return (
              <TableRow key={load.id}>
                <TableCell className="max-w-0">
                  <Link
                    href={`${loadsBase}/${load.id}`}
                    className="font-medium hover:underline"
                  >
                    {load.reference}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {load.origin} → {load.destination}
                  </p>
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-muted-foreground @2xl:table-cell">
                  {formatStopDate(`${load.delivered_on}T00:00:00`)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatRate(load.rate)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums @xl:table-cell">
                  {load.driver_pay === null ? (
                    <span
                      className="text-muted-foreground"
                      title={
                        load.pay_unknown
                          ? "Per-mile pay on a load with no miles"
                          : "No pay rate on this load"
                      }
                    >
                      —
                    </span>
                  ) : (
                    formatRate(load.driver_pay)
                  )}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums @xl:table-cell">
                  {load.expenses ? formatRate(load.expenses) : "—"}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums @3xl:table-cell">
                  {formatPerMile(load.miles ? load.rate / load.miles : null)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    profit < 0 && "text-destructive"
                  )}
                >
                  {formatRate(profit)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums @lg:table-cell">
                  {formatPercent(load.rate ? profit / load.rate : null)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {sorted.length > PAGE && (
        <div className="flex items-center justify-between gap-4 border-t px-6 py-3 text-sm text-muted-foreground">
          {showAll
            ? `Showing all ${sorted.length} loads.`
            : `Showing ${PAGE} of ${sorted.length} loads.`}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? "Show fewer" : "Show all"}
          </Button>
        </div>
      )}
    </>
  )
}

/**
 * The dashboard's reports in one card: the loads delivered in the period the
 * top tabs pick, by truck, driver, customer or lane, or load by load.
 */
export function ReportCards({
  loads,
  today,
  orgBase,
}: {
  /** Delivered or further along, newest delivery first. */
  loads: ReportLoad[]
  /** "YYYY-MM-DD", from the server so the render matches. */
  today: string
  /** /org/<slug> */
  orgBase: string
}) {
  const { period } = usePeriod()
  const [view, setView] = useState<View>("breakdown")
  const [by, setBy] = useState<Breakdown>("truck")
  const [sort, setSort] = useState<LoadSort>("newest")

  const inRange = useMemo(
    () => loads.filter((load) => inOverview(load, today, period)),
    [loads, today, period]
  )
  const sum = useMemo(() => totals(inRange), [inRange])

  return (
    <SettingsCard
      title="Reports"
      description={`Loads delivered in ${PERIOD_TEXT[period]}, by delivery date. Profit is before fixed costs like insurance and truck payments.`}
      contentClassName="@container px-0 pb-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-6 pb-4">
        <Tabs value={view} onValueChange={(value) => setView(value as View)}>
          <TabsList>
            <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
            <TabsTrigger value="loads">Profit per load</TabsTrigger>
          </TabsList>
        </Tabs>
        {view === "breakdown" ? (
          <Picker
            label="Break down by"
            value={by}
            onChange={setBy}
            items={BREAKDOWNS.map((value) => ({
              value,
              label: `By ${BREAKDOWN_LABELS[value].toLowerCase()}`,
            }))}
          />
        ) : (
          <Picker
            label="Sort loads"
            value={sort}
            onChange={setSort}
            items={(Object.keys(SORT_LABELS) as LoadSort[]).map((value) => ({
              value,
              label: SORT_LABELS[value],
            }))}
          />
        )}
      </div>

      {(sum.payUnknown > 0 || sum.noMiles > 0) && (
        <div className="mx-6 mb-4 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-muted-foreground">
            {sum.payUnknown > 0 && (
              <>
                {count(sum.payUnknown, "load")}{" "}
                {sum.payUnknown === 1 ? "has" : "have"} per-mile driver pay but
                no miles, so their pay isn&apos;t counted and profit looks
                higher than it is.{" "}
              </>
            )}
            {sum.noMiles > 0 && (
              <>
                {count(sum.noMiles, "load")}{" "}
                {sum.noMiles === 1 ? "has" : "have"} no loaded miles, so
                per-mile figures leave {sum.noMiles === 1 ? "it" : "them"} out.
              </>
            )}{" "}
            Add miles on the load to fix this.
          </p>
        </div>
      )}

      {inRange.length === 0 ? (
        <div className="px-6 pb-6">
          <SettingsEmptyState
            icon={ChartColumn}
            title={`No delivered loads in ${PERIOD_TEXT[period]}`}
          >
            Loads show up here once they&apos;re delivered.
          </SettingsEmptyState>
        </div>
      ) : view === "breakdown" ? (
        <BreakdownTable loads={inRange} by={by} orgBase={orgBase} />
      ) : (
        <LoadsTable
          key={`${period}-${sort}`}
          loads={inRange}
          sort={sort}
          loadsBase={`${orgBase}/loads`}
        />
      )}
    </SettingsCard>
  )
}
