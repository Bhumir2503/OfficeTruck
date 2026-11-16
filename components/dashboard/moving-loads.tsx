import { cn } from "cn"
import { TruckIcon } from "lucide-react"
import Link from "next/link"

import {
  SettingsCard,
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
import type { MovingLoad } from "@/lib/dashboard"
import { formatStopWindow, STATUS_STYLES } from "@/lib/load-format"
import { cityState } from "@/lib/report-format"
import { LOAD_STATUS_LABELS } from "@/lib/schemas/load"

const TABLE =
  "[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6"

/** Loads out on the road now, then the ones picking up in the next two days. */
export function MovingLoads({
  loads,
  loadsBase,
}: {
  loads: MovingLoad[]
  /** /org/<slug>/loads */
  loadsBase: string
}) {
  return (
    <SettingsCard
      title="On the road"
      description="Loads in transit or dispatched, then booked loads picking up in the next two days."
      contentClassName={loads.length ? "@container px-0 pb-0" : undefined}
    >
      {loads.length === 0 ? (
        <SettingsEmptyState icon={TruckIcon} title="Nothing moving">
          Dispatched loads and pickups in the next two days show up here.
        </SettingsEmptyState>
      ) : (
        <Table className={TABLE}>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="w-full">Load</TableHead>
              <TableHead className="hidden w-px @xl:table-cell">
                Driver
              </TableHead>
              <TableHead className="hidden w-px @3xl:table-cell">
                Next stop
              </TableHead>
              <TableHead className="w-px">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loads.map((load) => {
              const delivering = load.status === "loaded"
              const driver = load.driver?.full_name ?? load.driver_name
              const truck = load.truck_link?.unit_number ?? load.truck
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
                      {cityState(load.pickup_location)} →{" "}
                      {cityState(load.delivery_location)}
                    </p>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap @xl:table-cell">
                    {driver ? (
                      <>
                        {driver}
                        {truck && (
                          <p className="text-xs text-muted-foreground">
                            Truck {truck}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">No driver</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap @3xl:table-cell">
                    <span className="text-xs text-muted-foreground">
                      {delivering ? "Delivery" : "Pickup"}
                    </span>
                    <p className="text-sm">
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
                        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
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
    </SettingsCard>
  )
}
