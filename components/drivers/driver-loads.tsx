import { AlertTriangle, ArrowRight, Package } from "lucide-react"
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
import { overlapping, SCHEDULED_STATUSES } from "@/lib/dispatch-format"
import { loadDriverPay } from "@/lib/driver-format"
import type { DriverLoad } from "@/lib/drivers"
import { formatRate, formatStopDate } from "@/lib/load-format"

const miles = new Intl.NumberFormat("en-US")

/** The loads a driver has run, with miles, revenue and their pay. */
export function DriverLoads({
  loads,
  loadsBase,
}: {
  loads: DriverLoad[]
  /** /org/<slug>/loads */
  loadsBase: string
}) {
  if (loads.length === 0) {
    return (
      <SettingsCard title="Loads">
        <SettingsEmptyState icon={Package} title="No loads yet">
          Loads show up here once this driver is picked on them.
        </SettingsEmptyState>
      </SettingsCard>
    )
  }

  // Loads still on the schedule whose times overlap another one's.
  const scheduled = loads.filter((load) =>
    (SCHEDULED_STATUSES as readonly string[]).includes(load.status)
  )
  const clashes = new Map(
    scheduled
      .map(
        (load) =>
          [
            load.id,
            overlapping(load, scheduled).map((other) => other.reference),
          ] as const
      )
      .filter(([, others]) => others.length > 0)
  )

  // Cancelled loads stay in the list but don't count towards the totals.
  const counted = loads.filter((load) => load.status !== "cancelled")
  const totalMiles = counted.reduce((sum, load) => sum + (load.miles ?? 0), 0)
  const revenue = counted.reduce((sum, load) => sum + Number(load.rate), 0)
  const pays = counted.map((load) => loadDriverPay(load))
  const totalPay = pays.reduce<number>((sum, pay) => sum + (pay ?? 0), 0)
  const unpriced = pays.filter((pay) => pay === null).length

  const summary = [
    `${counted.length} ${counted.length === 1 ? "load" : "loads"}`,
    `${miles.format(totalMiles)} mi`,
    `${formatRate(revenue)} revenue`,
    counted.some((load) => load.driver_pay_type)
      ? `${formatRate(totalPay)} driver pay${unpriced ? ` (${unpriced} without miles)` : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <SettingsCard
      title="Loads"
      description="Driver pay uses the rate locked on each load when they were assigned."
      contentClassName="px-0 pb-0"
      footer={<SettingsCardFooter hint={summary} />}
    >
      <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>Load</TableHead>
            <TableHead className="hidden sm:table-cell">Pickup</TableHead>
            <TableHead className="text-right">Miles</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="hidden text-right sm:table-cell">
              Driver pay
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loads.map((load) => {
            const pay = loadDriverPay(load)
            const cancelled = load.status === "cancelled"
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
                    {clashes.get(load.id) && (
                      <span
                        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-4xl bg-amber-500/15 px-2.5 text-xs font-medium whitespace-nowrap text-amber-700 dark:text-amber-300"
                        title={`Overlaps ${clashes.get(load.id)!.join(", ")}`}
                      >
                        <AlertTriangle className="size-3" />
                        Overlaps {clashes.get(load.id)!.join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <span className="truncate">{load.pickup_location}</span>
                    <ArrowRight className="size-3 shrink-0" />
                    <span className="truncate">{load.delivery_location}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {formatStopDate(load.pickup_start)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {load.miles === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    miles.format(load.miles)
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
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {pay === null || cancelled ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    formatRate(pay)
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </SettingsCard>
  )
}
