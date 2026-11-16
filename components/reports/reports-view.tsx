"use client"

import { cn } from "cn"
import { ChartColumn, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatRate, formatStopDate } from "@/lib/load-format"
import {
  breakdown,
  BREAKDOWN_LABELS,
  BREAKDOWNS,
  formatDollars,
  formatMiles,
  formatPercent,
  formatPerMile,
  inPeriod,
  loadProfit,
  monthlySeries,
  PERIOD_LABELS,
  PERIODS,
  totals,
  type Breakdown,
  type BreakdownRow,
  type Period,
  type ReportLoad,
} from "@/lib/report-format"

const TABLE =
  "[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6"

function Stat({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone?: "danger" | "good"
}) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4 shadow-xs">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tracking-tight tabular-nums",
          tone === "danger" && "text-destructive",
          tone === "good" && "text-emerald-700 dark:text-emerald-400"
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

const chartConfig = {
  revenue: {
    label: "Revenue",
    theme: { light: "oklch(0.82 0 0)", dark: "oklch(0.45 0 0)" },
  },
  profit: {
    label: "Profit",
    theme: { light: "oklch(0.6 0.13 163)", dark: "oklch(0.7 0.15 162)" },
  },
} satisfies ChartConfig

const shortDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
})

function MonthlyChart({
  loads,
  today,
}: {
  loads: ReportLoad[]
  today: string
}) {
  const data = useMemo(() => monthlySeries(loads, today), [loads, today])
  return (
    <SettingsCard
      title="Last 12 months"
      description="Revenue and profit by the month each load delivered."
    >
      <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
        <BarChart data={data} margin={{ left: 4, right: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(value: number) => shortDollars.format(value)}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.fullLabel ?? ""
                }
                formatter={(value, name, item) => (
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span
                        className="size-2.5 shrink-0 rounded-[2px]"
                        style={{ background: item.color }}
                      />
                      {chartConfig[name as keyof typeof chartConfig].label}
                    </span>
                    <span className="font-mono font-medium text-foreground tabular-nums">
                      {formatDollars(Number(value))}
                    </span>
                  </div>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="revenue" fill="var(--color-revenue)" radius={3} />
          <Bar dataKey="profit" fill="var(--color-profit)" radius={3} />
        </BarChart>
      </ChartContainer>
    </SettingsCard>
  )
}

const recordPath: Record<Breakdown, string | null> = {
  truck: "equipment",
  driver: "drivers",
  broker: "brokers",
  lane: null,
}

function BreakdownCard({
  loads,
  orgBase,
}: {
  loads: ReportLoad[]
  orgBase: string
}) {
  const [by, setBy] = useState<Breakdown>("truck")
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
    <SettingsCard
      title="Breakdown"
      description="Where the money comes from, most profitable first. Cost is driver pay plus the load's expenses."
      action={
        <Tabs value={by} onValueChange={(value) => setBy(value as Breakdown)}>
          <TabsList>
            {BREAKDOWNS.map((key) => (
              <TabsTrigger key={key} value={key}>
                {BREAKDOWN_LABELS[key]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
      className="[&>div:first-child]:flex-col [&>div:first-child]:sm:flex-row"
      contentClassName="@container px-0 pb-0"
    >
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
    </SettingsCard>
  )
}

const PAGE = 25
type LoadSort = "newest" | "least" | "most"
const SORT_LABELS: Record<LoadSort, string> = {
  newest: "Newest",
  least: "Least profitable",
  most: "Most profitable",
}

function LoadsCard({
  loads,
  loadsBase,
}: {
  loads: ReportLoad[]
  loadsBase: string
}) {
  const [sort, setSort] = useState<LoadSort>("newest")
  const [showAll, setShowAll] = useState(false)
  const sorted = useMemo(() => {
    const list = [...loads]
    if (sort === "least") list.sort((a, b) => loadProfit(a) - loadProfit(b))
    if (sort === "most") list.sort((a, b) => loadProfit(b) - loadProfit(a))
    return list
  }, [loads, sort])
  const shown = showAll ? sorted : sorted.slice(0, PAGE)

  return (
    <SettingsCard
      title="Profit per load"
      description="What each load paid, what it cost to run, and what was left."
      contentClassName="@container px-0 pb-0"
      footer={
        sorted.length > PAGE && (
          <SettingsCardFooter
            hint={
              showAll
                ? `Showing all ${sorted.length} loads.`
                : `Showing ${PAGE} of ${sorted.length} loads.`
            }
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? "Show fewer" : "Show all"}
            </Button>
          </SettingsCardFooter>
        )
      }
    >
      <div className="px-6 pb-4">
        <ToggleGroup
          aria-label="Sort loads"
          variant="outline"
          size="sm"
          spacing={1}
          className="flex-wrap"
          value={[sort]}
          onValueChange={(value: string[]) =>
            setSort((value[0] as LoadSort | undefined) ?? "newest")
          }
        >
          {(Object.keys(SORT_LABELS) as LoadSort[]).map((key) => (
            <ToggleGroupItem key={key} value={key}>
              {SORT_LABELS[key]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
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
    </SettingsCard>
  )
}

/**
 * The Reports page: how the business did over a period, then by truck,
 * driver, broker and lane, then load by load.
 */
export function ReportsView({
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
  const [period, setPeriod] = useState<Period>("this_month")
  const inRange = useMemo(
    () => loads.filter((load) => inPeriod(load, period, today)),
    [loads, period, today]
  )
  const sum = useMemo(() => totals(inRange), [inRange])
  const label = PERIOD_LABELS[period].toLowerCase()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Delivered loads by delivery date. Profit is before fixed costs like
            insurance and truck payments.
          </p>
        </div>
        <ToggleGroup
          aria-label="Period"
          variant="outline"
          size="sm"
          spacing={1}
          className="flex-wrap"
          value={[period]}
          onValueChange={(value: string[]) => {
            if (value[0]) setPeriod(value[0] as Period)
          }}
        >
          {PERIODS.map((key) => (
            <ToggleGroupItem key={key} value={key}>
              {PERIOD_LABELS[key]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <Stat
          label="Revenue"
          value={formatDollars(sum.revenue)}
          detail={count(sum.loads, "load")}
        />
        <Stat
          label="Profit"
          value={formatDollars(sum.profit)}
          detail={`${formatPercent(sum.margin)} margin`}
          tone={sum.profit < 0 ? "danger" : sum.profit > 0 ? "good" : undefined}
        />
        <Stat
          label="Rate per mile"
          value={formatPerMile(sum.ratePerMile)}
          detail={`${formatMiles(sum.loadedMiles)} loaded miles`}
        />
        <Stat
          label="Cost per mile"
          value={formatPerMile(sum.costPerMile)}
          detail={`${formatDollars(sum.driverPay)} pay, ${formatDollars(sum.expenses)} expenses`}
        />
        <Stat
          label="Empty miles"
          value={formatPercent(sum.emptyShare)}
          detail={`${formatMiles(sum.emptyMiles)} deadhead miles`}
          tone={
            sum.emptyShare !== null && sum.emptyShare > 0.2
              ? "danger"
              : undefined
          }
        />
      </div>

      {(sum.payUnknown > 0 || sum.noMiles > 0) && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
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

      <MonthlyChart loads={loads} today={today} />

      {inRange.length === 0 ? (
        <SettingsCard title="Breakdown">
          <SettingsEmptyState
            icon={ChartColumn}
            title={`No delivered loads ${period === "all" ? "yet" : label}`}
          >
            Loads show up here once they&apos;re delivered.
          </SettingsEmptyState>
        </SettingsCard>
      ) : (
        <>
          <BreakdownCard loads={inRange} orgBase={orgBase} />
          <LoadsCard loads={inRange} loadsBase={`${orgBase}/loads`} />
        </>
      )}
    </div>
  )
}
