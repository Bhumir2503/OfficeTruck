"use client"

import { cn } from "cn"
import { ArrowDownRight, ArrowUpRight, Inbox, Plus } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { buttonVariants } from "@/components/ui/button"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import {
  change,
  formatDollars,
  OVERVIEW_PERIOD_LABELS,
  OVERVIEW_PERIODS,
  overview,
  type OverviewPeriod,
  type ReportLoad,
  type SeriesPoint,
} from "@/lib/report-format"

const compactDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 0,
})
const oneDecimal = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
})

const EXPENSES_COLOR =
  "color-mix(in oklch, var(--primary) 45%, var(--background))"
const revenueConfig = {
  revenue: { label: "Revenue", color: "var(--primary)" },
} satisfies ChartConfig
const costsConfig = {
  driverPay: { label: "Driver pay", color: "var(--primary)" },
  expenses: { label: "Expenses", color: EXPENSES_COLOR },
} satisfies ChartConfig
// The legend sits outside the chart, where its color variables don't reach.
const LEGEND = [
  { label: "Driver pay", color: "var(--primary)" },
  { label: "Expenses", color: EXPENSES_COLOR },
]

/** "+14.2%" in green or "-3.1%" in red, beside a total. */
function Change({
  current,
  previous,
  upIsGood = true,
}: {
  current: number
  previous: number
  /** For costs, going up is the bad direction. */
  upIsGood?: boolean
}) {
  const delta = change(current, previous)
  if (delta === null) {
    return (
      <span className="text-xs text-muted-foreground">No earlier period</span>
    )
  }
  const up = delta >= 0
  const good = up === upIsGood
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  return (
    <div className="flex items-center gap-0.5">
      <Arrow
        className={cn("size-3.5", good ? "text-emerald-600" : "text-red-600")}
        aria-hidden="true"
      />
      <span
        className={cn(
          "text-xs font-medium",
          good ? "text-emerald-600" : "text-red-600"
        )}
      >
        {up ? "+" : "-"}
        {oneDecimal.format(Math.abs(delta) * 100)}%
      </span>
    </div>
  )
}

function TooltipLine({
  color,
  label,
  value,
}: {
  color: string
  label: string
  value: number
}) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <div
        className="size-2 rounded-full sm:size-2.5"
        style={{ backgroundColor: color }}
      />
      <span className="text-[10px] text-muted-foreground sm:text-sm">
        {label}:
      </span>
      <span className="text-[10px] font-medium text-foreground tabular-nums sm:text-sm">
        {formatDollars(value)}
      </span>
    </div>
  )
}

/** What recharts hands a custom tooltip; only the hovered point is used. */
type TooltipProps = {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: unknown }>
}

function RevenueTooltip({ active, payload }: TooltipProps) {
  const point = payload?.[0]?.payload as SeriesPoint | undefined
  if (!active || !point) return null
  return (
    <div className="rounded-lg border border-border bg-popover p-2 shadow-lg sm:p-3">
      <p className="mb-1.5 text-xs font-medium text-foreground sm:mb-2 sm:text-sm">
        {point.fullLabel}
      </p>
      <TooltipLine
        color="var(--color-revenue)"
        label="Revenue"
        value={point.revenue}
      />
      <p className="mt-1 text-[10px] text-muted-foreground sm:text-xs">
        {point.loads} {point.loads === 1 ? "load" : "loads"} delivered
      </p>
    </div>
  )
}

function CostsTooltip({ active, payload }: TooltipProps) {
  const point = payload?.[0]?.payload as SeriesPoint | undefined
  if (!active || !point) return null
  return (
    <div className="rounded-lg border border-border bg-popover p-2 shadow-lg sm:p-3">
      <p className="mb-1.5 text-xs font-medium text-foreground sm:mb-2 sm:text-sm">
        {point.fullLabel}
      </p>
      <div className="space-y-1 sm:space-y-1.5">
        <TooltipLine
          color="var(--color-driverPay)"
          label="Driver pay"
          value={point.driverPay}
        />
        <TooltipLine
          color="var(--color-expenses)"
          label="Expenses"
          value={point.expenses}
        />
        <div className="mt-1 border-t border-border pt-1">
          <span className="text-[10px] font-medium text-foreground sm:text-xs">
            Total: {formatDollars(point.driverPay + point.expenses)}
          </span>
        </div>
      </div>
    </div>
  )
}

const axis = {
  axisLine: false,
  tickLine: false,
  tick: { fontSize: 10 },
} as const

/**
 * The top of the dashboard: the period tabs and the main actions, then
 * revenue and costs over that period.
 */
export function OverviewCharts({
  loads,
  today,
  inboxHref,
  newLoadHref,
}: {
  /** Delivered or further along. */
  loads: ReportLoad[]
  /** "YYYY-MM-DD", from the server so the render matches. */
  today: string
  inboxHref: string
  newLoadHref: string
}) {
  const [period, setPeriod] = useState<OverviewPeriod>("1year")
  const { points, total, previous } = useMemo(
    () => overview(loads, today, period),
    [loads, today, period]
  )
  const costs = total.driverPay + total.expenses
  const previousCosts = previous.driverPay + previous.expenses

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Period"
          className="flex w-fit items-center gap-1 rounded-lg bg-muted p-1"
        >
          {OVERVIEW_PERIODS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={period === key}
              onClick={() => setPeriod(key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all sm:text-sm",
                period === key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {OVERVIEW_PERIOD_LABELS[key]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Link
            href={inboxHref}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-8 gap-2 sm:h-9"
            )}
            aria-label="Rate con inbox"
          >
            <Inbox className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Rate con inbox</span>
          </Link>
          <Link
            href={newLoadHref}
            className={cn(buttonVariants({ size: "sm" }), "h-8 gap-2 sm:h-9")}
            aria-label="New load"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">New load</span>
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4 rounded-xl border bg-card p-4 sm:gap-5 sm:p-5">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground sm:text-sm">
              Revenue overview
            </p>
            <div className="flex items-center gap-2">
              <p className="text-xl leading-tight font-semibold tracking-tight tabular-nums sm:text-2xl">
                {formatDollars(total.revenue)}
              </p>
              <Change current={total.revenue} previous={previous.revenue} />
            </div>
          </div>
          <div className="h-[180px] w-full min-w-0 sm:h-[220px]">
            <ChartContainer config={revenueConfig} className="h-full w-full">
              <AreaChart data={points}>
                <defs>
                  <linearGradient
                    id="revenueGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--color-revenue)"
                      stopOpacity={0.15}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--color-revenue)"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="0" vertical={false} />
                <XAxis dataKey="label" {...axis} dy={8} minTickGap={16} />
                <YAxis
                  {...axis}
                  dx={-5}
                  width={40}
                  tickFormatter={(value: number) =>
                    compactDollars.format(value)
                  }
                />
                <Tooltip
                  content={(props) => <RevenueTooltip {...props} />}
                  cursor={{ strokeOpacity: 0.2 }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-revenue)"
                  strokeWidth={2}
                  fill="url(#revenueGradient)"
                />
              </AreaChart>
            </ChartContainer>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4 rounded-xl border bg-card p-4 sm:gap-5 sm:p-5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground sm:text-sm">
                Costs breakdown
              </p>
              <div className="flex items-center gap-3">
                {LEGEND.map((item) => (
                  <div key={item.label} className="flex items-center gap-1.5">
                    <div
                      className="size-2 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-[10px] text-muted-foreground sm:text-xs">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xl leading-tight font-semibold tracking-tight tabular-nums sm:text-2xl">
                {formatDollars(costs)}
              </p>
              <Change
                current={costs}
                previous={previousCosts}
                upIsGood={false}
              />
            </div>
          </div>
          <div className="h-[180px] w-full min-w-0 sm:h-[220px]">
            <ChartContainer config={costsConfig} className="h-full w-full">
              <BarChart data={points}>
                <CartesianGrid strokeDasharray="0" vertical={false} />
                <XAxis dataKey="label" {...axis} dy={8} minTickGap={16} />
                <YAxis
                  {...axis}
                  dx={-5}
                  width={40}
                  tickFormatter={(value: number) =>
                    compactDollars.format(value)
                  }
                />
                <Tooltip
                  content={(props) => <CostsTooltip {...props} />}
                  cursor={{ fillOpacity: 0.05 }}
                />
                <Bar
                  dataKey="driverPay"
                  stackId="costs"
                  fill="var(--color-driverPay)"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="expenses"
                  stackId="costs"
                  fill="var(--color-expenses)"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </div>
        </div>
      </div>
    </>
  )
}
