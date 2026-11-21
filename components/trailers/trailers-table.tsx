"use client"

import { Container, Search } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { ExpiryBadge } from "@/components/drivers/driver-badges"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { TruckStatusBadge } from "@/components/trucks/truck-badges"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { needsAction, type ComplianceItem } from "@/lib/driver-format"
import {
  TRUCK_STATUSES,
  TRUCK_STATUS_LABELS,
  type TruckStatus,
} from "@/lib/schemas/truck"
import { trailerDescription } from "@/lib/trailer-format"
import type { Trailer } from "@/lib/trailers"
import { truckComplianceItems } from "@/lib/truck-format"

type Filter = TruckStatus | "all"

const plural = (count: number, word: string) =>
  `${count} ${count === 1 ? word : `${word}s`}`

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

export function TrailersTable({
  trailers,
  base,
  trucksBase,
  today,
  canManage,
}: {
  trailers: Trailer[]
  /** /org/<slug>/trailers */
  base: string
  /** /org/<slug>/equipment */
  trucksBase: string
  /** "YYYY-MM-DD", from the server so both renders warn about the same dates. */
  today: string
  canManage: boolean
}) {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("active")

  const rows = useMemo(
    () =>
      trailers.map((trailer) => {
        // Same three dates as a truck: inspection, registration, plate.
        const items = truckComplianceItems(trailer, today)
        return {
          trailer,
          items,
          warnings: trailer.status === "active" ? flagged(items) : [],
        }
      }),
    [trailers, today]
  )

  const counts = useMemo(() => {
    const byStatus = { active: 0, out_of_service: 0, inactive: 0 }
    for (const trailer of trailers) byStatus[trailer.status] += 1
    return byStatus
  }, [trailers])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter(
      ({ trailer }) =>
        (filter === "all" || trailer.status === filter) &&
        [trailer.unit_number, trailer.vin, trailer.plate_number].some((value) =>
          value?.toLowerCase().includes(query)
        )
    )
  }, [rows, filter, search])

  const attention = rows.filter((row) => row.warnings.length > 0).length

  const addButton = (size: "sm" | "default") =>
    canManage && (
      <Link href={`${base}/new`} className={buttonVariants({ size })}>
        <Container />
        Add trailer
      </Link>
    )

  if (trailers.length === 0) {
    return (
      <SettingsCard title="Trailers">
        <SettingsEmptyState icon={Container} title="No trailers yet">
          {canManage
            ? "Add your trailers to track their plates, registrations and inspections, and which truck is pulling each one."
            : "Owners and admins can add trailers. Once they do, you'll see them here."}
        </SettingsEmptyState>
        {canManage && (
          <div className="mt-4 flex justify-center">{addButton("default")}</div>
        )}
      </SettingsCard>
    )
  }

  const filterOptions = [
    ...TRUCK_STATUSES.map((status) => ({
      value: status as Filter,
      name: TRUCK_STATUS_LABELS[status],
      count: counts[status],
    })),
    { value: "all" as Filter, name: "All", count: trailers.length },
  ].map((option) => ({ ...option, label: `${option.name} (${option.count})` }))

  const filtering = search.trim() !== "" || filter !== "all"
  const count = filtering
    ? `Showing ${filtered.length} of ${plural(trailers.length, "trailer")}`
    : plural(trailers.length, "trailer")

  return (
    <SettingsCard
      title="Trailers"
      action={addButton("sm")}
      contentClassName="px-0 pb-0"
      footer={
        <SettingsCardFooter
          hint={
            attention > 0 ? (
              <>
                {count} ·{" "}
                <span className="text-amber-700 dark:text-amber-300">
                  {plural(attention, "active trailer")} with something due in
                  the next 60 days
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
            aria-label="Search trailers"
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
            <TableHead>Trailer</TableHead>
            <TableHead className="hidden md:table-cell">Pulled by</TableHead>
            <TableHead className="hidden lg:table-cell">Plate</TableHead>
            <TableHead className="hidden sm:table-cell">Compliance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={4}
                className="h-24 text-center text-muted-foreground"
              >
                {search.trim() === "" && filter !== "all"
                  ? `No ${TRUCK_STATUS_LABELS[filter].toLowerCase()} trailers.`
                  : "No trailers match your search."}
              </TableCell>
            </TableRow>
          )}
          {filtered.map(({ trailer, items, warnings }) => {
            const off = trailer.status !== "active"
            return (
              // The unit number's link covers the whole row; the truck link
              // sits above it.
              <TableRow key={trailer.id} className="relative cursor-pointer">
                <TableCell className="max-w-64 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Container className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link
                          href={`${base}/${trailer.id}`}
                          className="truncate font-medium after:absolute after:inset-0 hover:underline"
                        >
                          {trailer.unit_number}
                        </Link>
                        {off && (
                          <TruckStatusBadge
                            status={trailer.status}
                            className="h-5 shrink-0 px-2"
                          />
                        )}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">
                        {trailerDescription(trailer) ||
                          trailer.vin ||
                          "No details yet"}
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
                <TableCell className="hidden text-sm md:table-cell">
                  {trailer.truck ? (
                    <Link
                      href={`${trucksBase}/${trailer.truck.id}`}
                      className="relative z-10 hover:underline"
                    >
                      {trailer.truck.unit_number}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Unhooked</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  {trailer.plate_number ? (
                    <>
                      <span className="text-foreground">
                        {trailer.plate_number}
                      </span>
                      {trailer.plate_state && ` · ${trailer.plate_state}`}
                    </>
                  ) : (
                    "Not set"
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
                  ) : (
                    <span className="text-muted-foreground">
                      {items.every((item) => item.due)
                        ? "All current"
                        : `${items.filter((item) => item.due).length} of ${items.length} dates on file`}
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
