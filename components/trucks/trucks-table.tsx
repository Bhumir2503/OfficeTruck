"use client"

import { Search, Truck as TruckIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { AllCurrent, ExpiryBadge } from "@/components/drivers/driver-badges"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { LastDeliveryCell, NowCell, NowLine } from "@/components/now-cells"
import { TruckStatusBadge } from "@/components/trucks/truck-badges"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { needsAction, type ComplianceItem } from "@/lib/driver-format"
import {
  TRUCK_STATUSES,
  TRUCK_STATUS_LABELS,
  type TruckStatus,
} from "@/lib/schemas/truck"
import {
  truckServiceItem,
  truckComplianceItems,
  truckDescription,
} from "@/lib/truck-format"
import type { LastService, Truck, TruckNow } from "@/lib/trucks"

type Filter = TruckStatus | "all"

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

export function TrucksTable({
  trucks,
  base,
  today,
  canManage,
  now,
  lastService,
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
        const service = truckServiceItem(truck, lastService[truck.id], today)
        if (service) items.push(service)
        return {
          truck,
          items,
          // Parked and retired trucks aren't on the road; don't nag about them.
          warnings: truck.status === "active" ? flagged(items) : [],
        }
      }),
    [trucks, today, lastService]
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

  if (trucks.length === 0) {
    return (
      <SettingsCard title="Trucks">
        <SettingsEmptyState icon={TruckIcon} title="No trucks yet">
          {canManage
            ? "Add your trucks to track inspections and registrations, and see cost per mile and profit for each."
            : "Owners and admins can add trucks. Once they do, you'll see them here."}
        </SettingsEmptyState>
        {canManage && (
          <div className="mt-4 flex justify-center">{addButton("default")}</div>
        )}
      </SettingsCard>
    )
  }

  // The status filter's choices, each with how many trucks it shows.
  const filterOptions: {
    value: Filter
    name: string
    label: string
    count: number
  }[] = [
    ...TRUCK_STATUSES.map((status) => ({
      value: status,
      name: TRUCK_STATUS_LABELS[status],
      count: counts[status],
    })),
    { value: "all" as const, name: "All", count: trucks.length },
  ].map((option) => ({
    ...option,
    // What the closed dropdown shows.
    label: `${option.name} (${option.count})`,
  }))

  const filtering = search.trim() !== "" || filter !== "all"
  const count = filtering
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
      <div className="flex flex-col gap-3 px-6 pb-4 sm:flex-row sm:items-center">
        <div className="relative w-full">
          <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search unit, VIN or plate"
            aria-label="Search trucks"
            className="pl-7"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={filter}
          onValueChange={(value) =>
            setFilter((value as Filter | null) ?? "all")
          }
          items={filterOptions}
        >
          <SelectTrigger
            aria-label="Filter by status"
            className="w-full shrink-0 sm:w-44"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {filterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.name}
                <span className="ml-auto pr-2 text-muted-foreground tabular-nums">
                  {option.count}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>Truck</TableHead>
            <TableHead className="hidden md:table-cell">Now</TableHead>
            <TableHead className="hidden lg:table-cell">
              Last delivery
            </TableHead>
            <TableHead className="hidden xl:table-cell">Driver</TableHead>
            <TableHead className="hidden sm:table-cell">Compliance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={5}
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
