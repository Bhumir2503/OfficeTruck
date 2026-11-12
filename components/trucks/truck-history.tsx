import { ArrowRight, Package } from "lucide-react"
import Link from "next/link"

import { LoadStatusBadge } from "@/components/loads/load-status-menu"
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
import { formatRate, formatStopDate } from "@/lib/load-format"
import {
  loadProfits,
  monthlyFixedCosts,
  totalMiles,
  weekSummary,
} from "@/lib/truck-format"
import type { Truck, TruckLoad } from "@/lib/trucks"

const number = new Intl.NumberFormat("en-US")
const day = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})
const formatDay = (date: string) => day.format(new Date(`${date}T00:00:00Z`))

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  )
}

/** This week at a glance: loads, miles, revenue and cost per mile. */
export function TruckWeek({
  truck,
  loads,
  today,
}: {
  truck: Truck
  loads: TruckLoad[]
  today: string
}) {
  const week = weekSummary(truck, loads, today)
  const monthly = monthlyFixedCosts(truck)
  return (
    <SettingsCard
      title="This week"
      description={`${formatDay(week.start)} – ${formatDay(week.end)}, by pickup date.`}
      footer={
        <SettingsCardFooter
          hint={
            monthly === 0
              ? "Add fixed costs below to include them in cost per mile."
              : `Fixed costs: ${formatRate(monthly)} a month, ${formatRate(week.fixedCost)} this week.${week.unpriced ? ` ${week.unpriced} ${week.unpriced === 1 ? "load has" : "loads have"} no driver pay yet.` : ""}`
          }
        />
      }
    >
      <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <Stat label="Loads" value={week.loads} />
        <Stat
          label="Miles"
          value={number.format(week.miles)}
          hint="Loaded and empty"
        />
        <Stat label="Revenue" value={formatRate(week.revenue)} />
        <Stat
          label="Cost per mile"
          value={
            week.costPerMile === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              formatRate(week.costPerMile)
            )
          }
          hint={
            week.costPerMile === null
              ? "No miles this week"
              : "Fixed costs and driver pay"
          }
        />
      </dl>
    </SettingsCard>
  )
}

/** Every load this truck has run, with miles, revenue and profit. */
export function TruckLoads({
  truck,
  loads,
  loadsBase,
}: {
  truck: Truck
  loads: TruckLoad[]
  /** /org/<slug>/loads */
  loadsBase: string
}) {
  if (loads.length === 0) {
    return (
      <SettingsCard title="Loads">
        <SettingsEmptyState icon={Package} title="No loads yet">
          Loads show up here once this truck is picked on them.
        </SettingsEmptyState>
      </SettingsCard>
    )
  }

  const profits = loadProfits(truck, loads)
  // Cancelled loads stay in the list but don't count towards the totals.
  const counted = loads.filter((load) => load.status !== "cancelled")
  const miles = counted.reduce((sum, load) => sum + totalMiles(load), 0)
  const revenue = counted.reduce((sum, load) => sum + Number(load.rate), 0)
  const known = counted
    .map((load) => profits.get(load.id)?.profit ?? null)
    .filter((profit): profit is number => profit !== null)
  const profit = known.reduce((sum, value) => sum + value, 0)
  const unknown = counted.length - known.length

  const summary = [
    `${counted.length} ${counted.length === 1 ? "load" : "loads"}`,
    `${number.format(miles)} mi`,
    `${formatRate(revenue)} revenue`,
    known.length
      ? `${formatRate(profit)} profit${unknown ? ` (${unknown} not worked out)` : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <SettingsCard
      title="Loads"
      description="Profit is the rate less driver pay and the load's share of the month's fixed costs. Fuel isn't counted yet."
      contentClassName="px-0 pb-0"
      footer={<SettingsCardFooter hint={summary} />}
    >
      <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>Load</TableHead>
            <TableHead className="hidden md:table-cell">Driver</TableHead>
            <TableHead className="hidden sm:table-cell">Pickup</TableHead>
            <TableHead className="text-right">Miles</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="hidden text-right lg:table-cell">
              Driver pay
            </TableHead>
            <TableHead className="hidden text-right lg:table-cell">
              Fixed costs
            </TableHead>
            <TableHead className="text-right">Profit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loads.map((load) => {
            const result = profits.get(load.id)
            const cancelled = load.status === "cancelled"
            const dash = <span className="text-muted-foreground">—</span>
            return (
              <TableRow key={load.id}>
                <TableCell className="max-w-64 py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`${loadsBase}/${load.id}`}
                      className="truncate font-medium hover:underline"
                    >
                      {load.reference}
                    </Link>
                    {load.status !== "delivered" &&
                      load.status !== "invoiced" && (
                        <LoadStatusBadge status={load.status} />
                      )}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <span className="truncate">{load.pickup_location}</span>
                    <ArrowRight className="size-3 shrink-0" />
                    <span className="truncate">{load.delivery_location}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">
                  {load.driver?.full_name ?? dash}
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {formatStopDate(load.pickup_start)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {load.miles === null && load.empty_miles === null ? (
                    dash
                  ) : (
                    <>
                      {number.format(totalMiles(load))}
                      {load.empty_miles ? (
                        <span className="block text-xs text-muted-foreground">
                          {number.format(load.empty_miles)} empty
                        </span>
                      ) : null}
                    </>
                  )}
                </TableCell>
                <TableCell
                  className={
                    cancelled
                      ? "text-right text-muted-foreground tabular-nums line-through"
                      : "text-right tabular-nums"
                  }
                >
                  {formatRate(load.rate)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">
                  {result?.driverPay == null
                    ? dash
                    : formatRate(result.driverPay)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">
                  {result?.fixedCost == null
                    ? dash
                    : formatRate(result.fixedCost)}
                </TableCell>
                <TableCell
                  className={
                    result?.profit != null && result.profit < 0
                      ? "text-right text-destructive tabular-nums"
                      : "text-right tabular-nums"
                  }
                >
                  {result?.profit == null ? dash : formatRate(result.profit)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </SettingsCard>
  )
}
