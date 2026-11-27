"use client"

import { cn } from "cn"
import { TruckIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import {
  EmptyRow,
  HEAD,
  HEAD_ROW,
  ShowMore,
  TableCard,
} from "@/components/dashboard/table-panel"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { MovingLoad } from "@/lib/dashboard"
import { formatStopWindow, STATUS_STYLES } from "@/lib/load-format"
import { cityState } from "@/lib/report-format"
import { LOAD_STATUS_LABELS } from "@/lib/schemas/load"

const FIRST = 6

/** Loads out on the road now, then the ones picking up in the next two days. */
export function MovingLoadsCard({
  loads,
  loadsBase,
}: {
  loads: MovingLoad[]
  /** /org/<slug>/loads */
  loadsBase: string
}) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? loads : loads.slice(0, FIRST)

  return (
    <TableCard
      icon={TruckIcon}
      title="On the road"
      count={loads.length}
      footer={
        loads.length > FIRST && (
          <ShowMore
            shown={shown.length}
            total={loads.length}
            noun="loads"
            showAll={showAll}
            onToggle={() => setShowAll((value) => !value)}
          />
        )
      }
      className="flex-1"
    >
      {loads.length === 0 ? (
        <EmptyRow>
          Nothing in transit or picking up in the next two days.
        </EmptyRow>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className={HEAD_ROW}>
              <TableHead className={cn(HEAD, "w-full")}>Load</TableHead>
              <TableHead className={cn(HEAD, "hidden w-px @md:table-cell")}>
                Driver
              </TableHead>
              <TableHead className={cn(HEAD, "hidden w-px @xl:table-cell")}>
                Next stop
              </TableHead>
              <TableHead className={cn(HEAD, "w-px")}>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((load) => {
              const delivering = load.status === "loaded"
              const driver = load.driver?.full_name ?? load.driver_name
              const truck = load.truck_link?.unit_number ?? load.truck
              return (
                <TableRow key={load.id}>
                  <TableCell className="max-w-0 py-2.5">
                    <Link
                      href={`${loadsBase}/${load.id}`}
                      className="text-xs font-medium hover:underline sm:text-sm"
                    >
                      {load.reference}
                    </Link>
                    <p className="truncate text-[10px] text-muted-foreground sm:text-xs">
                      {cityState(load.pickup_location)} →{" "}
                      {cityState(load.delivery_location)}
                    </p>
                  </TableCell>
                  <TableCell className="hidden text-xs whitespace-nowrap sm:text-sm @md:table-cell">
                    {driver ? (
                      <>
                        {driver}
                        {truck && (
                          <p className="text-[10px] text-muted-foreground sm:text-xs">
                            Truck {truck}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">No driver</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap @xl:table-cell">
                    <span className="text-[10px] text-muted-foreground sm:text-xs">
                      {delivering ? "Delivery" : "Pickup"}
                    </span>
                    <p className="text-xs sm:text-sm">
                      {delivering
                        ? formatStopWindow(
                            load.delivery_start,
                            null,
                            load.delivery_appointment_type
                          )
                        : formatStopWindow(
                            load.pickup_start,
                            null,
                            load.pickup_appointment_type
                          )}
                    </p>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-md px-2 py-1 text-[10px] font-medium whitespace-nowrap sm:text-xs",
                        STATUS_STYLES[load.status]
                      )}
                    >
                      {LOAD_STATUS_LABELS[load.status]}
                    </span>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </TableCard>
  )
}
