"use client"

import { Truck as TruckIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { AllCurrent, ExpiryBadge } from "@/components/drivers/driver-badges"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { LastDeliveryCell, NowCell, NowLine } from "@/components/now-cells"
import { TableFilters, type FilterOption } from "@/components/table-filters"
import { TruckStatusBadge } from "@/components/trucks/truck-badges"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  formatDate,
  needsAction,
  type ComplianceItem,
} from "@/lib/driver-format"
import {
  TRUCK_STATUSES,
  TRUCK_STATUS_LABELS,
  type TruckStatus,
} from "@/lib/schemas/truck"
import {
  truckServiceItem,
  withEstimatedOdometer,
  truckComplianceItems,
  truckDescription,
} from "@/lib/truck-format"
import type {
  LastService,
  MilesSinceReading,
  Truck,
  TruckNow,
} from "@/lib/trucks"

type Filter = TruckStatus | "all"

const thousands = new Intl.NumberFormat("en-US")

function plural(count: number, word: string) {
  return `${count} ${count === 1 ? word : `${word}s`}`
}

/** Items that are late or due within 60 days, most pressing first. */
function flagged(items: ComplianceItem[]) {
  const days = (item: ComplianceItem) =>
    item.expiry.state === "missing"
      ? Infinity
      : item.expiry.state === "expired"
        ? -item.expiry.days
        : item.expiry.days
  return items
    .filter((item) => needsAction(item.expiry.state))
    .sort((a, b) => days(a) - days(b))
}

/**
 * The truck's odometer: the last reading, or an estimate when loads have run
 * since it ("≈ 108,940 mi", with the reading it's counted from).
 */
function OdometerCell({
  reading,
  readOn,
  since,
}: {
  reading: number
  readOn: string | null
  since: MilesSinceReading | undefined
}) {
  if (since?.miles) {
    return (
      <div className="min-w-0">
        <div
          className="text-sm font-medium tabular-nums"
          title="Estimated from the miles of loads run since the last reading"
        >
          ≈ {thousands.format(reading + since.miles)} mi
        </div>
        <div className="text-sm text-muted-foreground">
          {thousands.format(reading)}
          {readOn && ` on ${formatDate(readOn)}`} +{" "}
          {since.loads === 1 ? "1 load" : `${since.loads} loads`}
        </div>
      </div>
    )
  }
  return (
    <div className="min-w-0">
      <div className="text-sm font-medium tabular-nums">
        {thousands.format(reading)} mi
      </div>
      {readOn && (
        <div className="text-sm text-muted-foreground">
          {formatDate(readOn)}
        </div>
      )}
    </div>
  )
}

export function TrucksTable({
  trucks,
  base,
  today,
  canManage,
  now,
  lastService,
  milesSince,
  loadsBase,
  driversBase,
}: {
  trucks: Truck[]
  /** /org/<slug>/equipment */
  base: string
  /** "YYYY-MM-DD", from the server so both renders warn about the same dates. */
  today: string
  canManage: boolean
  /** The load each truck is on now, its next booked one and its last delivery. */
  now: Record<string, TruckNow>
  /** Each truck's last preventive service, for service reminders. */
  lastService: Record<string, LastService>
  /** Load miles run since each truck's last odometer reading. */
  milesSince: Record<string, MilesSinceReading>
  /** /org/<slug>/loads */
  loadsBase: string
  /** /org/<slug>/drivers */
  driversBase: string
}) {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("active")

  const rows = useMemo(
    () =>
      trucks.map((truck) => {
        const items = [...truckComplianceItems(truck, today)]
        // Service only shows once it's due soon or overdue.
        const service = truckServiceItem(
          withEstimatedOdometer(truck, milesSince[truck.id]),
          lastService[truck.id],
          today
        )
        if (service) items.push(service)
        return {
          truck,
          items,
          // Parked and retired trucks aren't on the road; don't nag about them.
          warnings: truck.status === "active" ? flagged(items) : [],
        }
      }),
    [trucks, today, lastService, milesSince]
  )

  const counts = useMemo(() => {
    const byStatus = { active: 0, out_of_service: 0, inactive: 0 }
    for (const truck of trucks) {
      byStatus[truck.status] += 1
    }
    return byStatus
  }, [trucks])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter(
      ({ truck }) =>
        (filter === "all" || truck.status === filter) &&
        [truck.unit_number, truck.vin, truck.plate_number].some((value) =>
          value?.toLowerCase().includes(query)
        )
    )
  }, [rows, filter, search])

  const attention = rows.filter((row) => row.warnings.length > 0).length

  const addButton = (size: "sm" | "default") =>
    canManage && (
      <Link href={`${base}/new`} className={buttonVariants({ size })}>
        <TruckIcon />
        Add truck
      </Link>
    )

  // The status filter's choices, each with how many trucks it shows.
  const filterOptions: FilterOption<Filter>[] = [
    ...TRUCK_STATUSES.map((status) => ({
      value: status,
      name: TRUCK_STATUS_LABELS[status],
      count: counts[status],
    })),
    { value: "all", name: "All", count: trucks.length },
  ]

  const empty = trucks.length === 0
  const filtering = search.trim() !== "" || filter !== "all"
  const count = empty
    ? "No trucks"
    : filtering
      ? `Showing ${filtered.length} of ${plural(trucks.length, "truck")}`
      : plural(trucks.length, "truck")
  const notes = [
    attention > 0 &&
      `${plural(attention, "active truck")} with something due in the next 60 days`,
  ].filter(Boolean)

  return (
    <SettingsCard
      title="Trucks"
      action={addButton("sm")}
      contentClassName="px-0 pb-0"
      footer={
        <SettingsCardFooter
          hint={
            notes.length ? (
              <>
                {count} ·{" "}
                <span className="text-amber-700 dark:text-amber-300">
                  {notes.join(" · ")}
                </span>
              </>
            ) : (
              count
            )
          }
        />
      }
    >
      <TableFilters
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search unit, VIN or plate"
        searchLabel="Search trucks"
        filter={filter}
        onFilterChange={setFilter}
        options={filterOptions}
        disabled={empty}
      />
      <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>Truck</TableHead>
            <TableHead className="hidden md:table-cell">Now</TableHead>
            <TableHead className="hidden lg:table-cell">
              Last delivery
            </TableHead>
            <TableHead className="hidden lg:table-cell">Odometer</TableHead>
            <TableHead className="hidden xl:table-cell">Driver</TableHead>
            <TableHead className="hidden sm:table-cell">Compliance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {empty && (
            // The same table as when there are trucks, so the page matches
            // its loading skeleton; the body says how to get started.
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={6} className="py-10 whitespace-normal">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                    <TruckIcon className="size-5 text-muted-foreground" />
                  </div>
                  <p className="font-medium">No trucks yet</p>
                  <p className="max-w-sm text-sm text-balance text-muted-foreground">
                    {canManage
                      ? "Add your trucks to track inspections and registrations, and see cost per mile and profit for each."
                      : "Owners and admins can add trucks. Once they do, you'll see them here."}
                  </p>
                </div>
              </TableCell>
            </TableRow>
          )}
          {!empty && filtered.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="h-24 text-center text-muted-foreground"
              >
                {search.trim() === "" && filter !== "all"
                  ? `No ${TRUCK_STATUS_LABELS[filter].toLowerCase()} trucks.`
                  : "No trucks match your search."}
              </TableCell>
            </TableRow>
          )}
          {filtered.map(({ truck, items, warnings }) => {
            const description = truckDescription(truck)
            // Parked and retired trucks aren't running loads.
            const off = truck.status !== "active"
            return (
              // The unit number's link covers the whole row, so any of it
              // opens the truck; the load and driver links sit above it.
              <TableRow key={truck.id} className="relative cursor-pointer">
                <TableCell className="max-w-64 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <TruckIcon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link
                          href={`${base}/${truck.id}`}
                          className="truncate font-medium after:absolute after:inset-0 hover:underline"
                        >
                          {truck.unit_number}
                        </Link>
                        {off && (
                          <TruckStatusBadge
                            status={truck.status}
                            className="h-5 shrink-0 px-2"
                          />
                        )}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">
                        {description || truck.vin || "No details yet"}
                      </div>
                      <NowLine off={off} now={now[truck.id]} />
                      {warnings.length > 0 && (
                        // The compliance column is hidden on phones; keep the warnings.
                        <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                          {warnings.map((item) => (
                            <ExpiryBadge key={item.key} item={item} showLabel />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden max-w-64 md:table-cell">
                  <NowCell
                    off={off}
                    now={now[truck.id]}
                    loadsBase={loadsBase}
                  />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <LastDeliveryCell
                    last={now[truck.id]?.last ?? null}
                    today={today}
                    loadsBase={loadsBase}
                  />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {/* The latest reading: from a driver, the office or a
                      service, whichever was highest. */}
                  {truck.odometer !== null ? (
                    <OdometerCell
                      reading={truck.odometer}
                      readOn={truck.odometer_on}
                      since={milesSince[truck.id]}
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Not recorded
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden text-sm xl:table-cell">
                  {truck.default_driver ? (
                    <Link
                      href={`${driversBase}/${truck.default_driver.id}`}
                      className="relative z-10 hover:underline"
                    >
                      {truck.default_driver.full_name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </TableCell>
                <TableCell className="hidden max-w-80 text-sm whitespace-normal sm:table-cell">
                  {off ? (
                    <span className="text-muted-foreground">Not tracked</span>
                  ) : warnings.length ? (
                    <div className="flex flex-wrap gap-1">
                      {warnings.map((item) => (
                        <ExpiryBadge key={item.key} item={item} showLabel />
                      ))}
                    </div>
                  ) : items.every((item) => item.due) ? (
                    <AllCurrent />
                  ) : (
                    <span className="text-muted-foreground">
                      {items.filter((item) => item.due).length} of{" "}
                      {items.length} dates on file
                    </span>
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
