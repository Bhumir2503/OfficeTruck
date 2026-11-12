"use client"

import { Search, Truck as TruckIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { ExpiryBadge } from "@/components/drivers/driver-badges"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { EldBadge, TruckStatusBadge } from "@/components/trucks/truck-badges"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { needsAction, type ComplianceItem } from "@/lib/driver-format"
import {
  TRUCK_STATUSES,
  TRUCK_STATUS_LABELS,
  type TruckStatus,
} from "@/lib/schemas/truck"
import {
  taxItem,
  truckComplianceItems,
  truckDescription,
} from "@/lib/truck-format"
import type { TaxFiling, Truck } from "@/lib/trucks"

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
  filings,
  base,
  today,
  canManage,
}: {
  trucks: Truck[]
  filings: TaxFiling[]
  /** /org/<slug>/equipment */
  base: string
  /** "YYYY-MM-DD", from the server so both renders warn about the same dates. */
  today: string
  canManage: boolean
}) {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("active")

  const rows = useMemo(
    () =>
      trucks.map((truck) => {
        const items = [
          ...truckComplianceItems(truck, today),
          taxItem(truck.id, filings, today),
        ]
        return {
          truck,
          items,
          // Parked and retired trucks aren't on the road; don't nag about them.
          warnings: truck.status === "active" ? flagged(items) : [],
        }
      }),
    [trucks, filings, today]
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
  const unlinked = trucks.filter(
    (truck) => truck.status === "active" && !truck.motive_vehicle_id
  ).length

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
            ? "Add your trucks to track inspections and registrations, link them to Motive for IFTA, and see cost per mile and profit for each."
            : "Owners and admins can add trucks. Once they do, you'll see them here."}
        </SettingsEmptyState>
        {canManage && (
          <div className="mt-4 flex justify-center">{addButton("default")}</div>
        )}
      </SettingsCard>
    )
  }

  const filtering = search.trim() !== "" || filter !== "all"
  const count = filtering
    ? `Showing ${filtered.length} of ${plural(trucks.length, "truck")}`
    : plural(trucks.length, "truck")
  const notes = [
    attention > 0 &&
      `${plural(attention, "active truck")} with something due in the next 60 days`,
    unlinked > 0 && `${unlinked} not connected to Motive`,
  ].filter(Boolean)

  return (
    <SettingsCard
      title="Trucks"
      description="Search by unit number, VIN or plate, or filter by status."
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
        <ToggleGroup
          aria-label="Filter by status"
          variant="outline"
          size="sm"
          spacing={1}
          className="shrink-0 flex-wrap"
          value={[filter]}
          onValueChange={(value: string[]) =>
            setFilter((value[0] as Filter | undefined) ?? "all")
          }
        >
          {TRUCK_STATUSES.map((status) => (
            <ToggleGroupItem key={status} value={status}>
              {TRUCK_STATUS_LABELS[status]}
              <span className="text-muted-foreground tabular-nums">
                {counts[status]}
              </span>
            </ToggleGroupItem>
          ))}
          <ToggleGroupItem value="all">
            All
            <span className="text-muted-foreground tabular-nums">
              {trucks.length}
            </span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>Truck</TableHead>
            <TableHead className="hidden lg:table-cell">Plate</TableHead>
            <TableHead className="hidden md:table-cell">Driver</TableHead>
            <TableHead className="hidden md:table-cell">ELD</TableHead>
            <TableHead className="hidden sm:table-cell">Compliance</TableHead>
            <TableHead className="w-32">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
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
            return (
              <TableRow key={truck.id}>
                <TableCell className="max-w-64 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <TruckIcon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`${base}/${truck.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {truck.unit_number}
                      </Link>
                      <div className="truncate text-sm text-muted-foreground">
                        {description || truck.vin || "No details yet"}
                      </div>
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
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {truck.plate_number ? (
                    <>
                      <span className="text-foreground">
                        {truck.plate_number}
                      </span>
                      {truck.plate_state && ` · ${truck.plate_state}`}
                    </>
                  ) : (
                    "Not set"
                  )}
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">
                  {truck.default_driver ? (
                    truck.default_driver.full_name
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <EldBadge connected={!!truck.motive_vehicle_id} />
                </TableCell>
                <TableCell className="hidden max-w-80 text-sm whitespace-normal sm:table-cell">
                  {truck.status !== "active" ? (
                    <span className="text-muted-foreground">Not tracked</span>
                  ) : warnings.length ? (
                    <div className="flex flex-wrap gap-1">
                      {warnings.map((item) => (
                        <ExpiryBadge key={item.key} item={item} showLabel />
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">
                      {items.every((item) => item.due)
                        ? "All current"
                        : `${items.filter((item) => item.due).length} of ${items.length} dates on file`}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <TruckStatusBadge status={truck.status} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </SettingsCard>
  )
}
