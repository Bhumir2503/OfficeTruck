"use client"

import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Package,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { LoadStatusBadge } from "@/components/loads/load-status-menu"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
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
import { isFallenThrough } from "@/lib/schemas/load"

const miles = new Intl.NumberFormat("en-US")

/** Rows per page. Totals and overlap warnings still use every load. */
const PAGE_SIZE = 10

/** The loads a driver has run, with miles, revenue and their pay. */
export function DriverLoads({
  loads,
  loadsBase,
}: {
  loads: DriverLoad[]
  /** /org/<slug>/loads */
  loadsBase: string
}) {
  const [page, setPage] = useState(0)

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

  // Cancelled and TONU loads stay in the list but weren't driven, so they
  // don't count towards the totals.
  const counted = loads.filter((load) => !isFallenThrough(load.status))
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

  const pages = Math.ceil(loads.length / PAGE_SIZE)
  // Stays in range if loads go away (say, one is unassigned).
  const current = Math.min(page, pages - 1)
  const first = current * PAGE_SIZE
  const shown = loads.slice(first, first + PAGE_SIZE)

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
            <TableHead className="hidden text-right sm:table-cell">
              Miles
            </TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="hidden text-right sm:table-cell">
              Driver pay
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((load) => {
            const pay = loadDriverPay(load)
            const cancelled = isFallenThrough(load.status)
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
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
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
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t px-6 py-2.5">
          <span className="text-sm text-muted-foreground tabular-nums">
            {first + 1}–{first + shown.length} of {loads.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Newer loads"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="px-2 text-sm text-muted-foreground tabular-nums">
              Page {current + 1} of {pages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Older loads"
              disabled={current === pages - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </SettingsCard>
  )
}
