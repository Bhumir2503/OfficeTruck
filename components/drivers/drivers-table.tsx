"use client"

import { Search, UserRoundPlus } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import {
  DriverStatusBadge,
  ExpiryBadge,
} from "@/components/drivers/driver-badges"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import {
  complianceItems,
  formatPay,
  needsAction,
  type ComplianceItem,
} from "@/lib/driver-format"
import type { Driver } from "@/lib/drivers"
import { initials } from "@/lib/initials"
import { formatPhone } from "@/lib/phone"
import {
  DRIVER_STATUSES,
  DRIVER_STATUS_LABELS,
  type DriverStatus,
} from "@/lib/schemas/driver"

type Filter = DriverStatus | "all"

function plural(count: number, word: string) {
  return `${count} ${count === 1 ? word : `${word}s`}`
}

/** Items that are late or due within 60 days, most pressing first. */
function flagged(items: ComplianceItem[]) {
  return items
    .filter((item) => needsAction(item.expiry.state))
    .sort((a, b) => {
      const days = (item: ComplianceItem) =>
        item.expiry.state === "missing"
          ? Infinity
          : item.expiry.state === "expired"
            ? -item.expiry.days
            : item.expiry.days
      return days(a) - days(b)
    })
}

/** The warnings for a driver, or a quiet line when there's nothing to do. */
function ComplianceSummary({
  items,
  status,
}: {
  items: ComplianceItem[]
  status: DriverStatus
}) {
  if (status === "inactive") {
    return <span className="text-muted-foreground">Not tracked</span>
  }
  const warnings = flagged(items)
  if (warnings.length) {
    return (
      <div className="flex flex-wrap gap-1">
        {warnings.map((item) => (
          <ExpiryBadge key={item.key} item={item} showLabel />
        ))}
      </div>
    )
  }
  const onFile = items.filter((item) => item.due).length
  return (
    <span className="text-muted-foreground">
      {onFile === items.length
        ? "All current"
        : `${onFile} of ${items.length} dates on file`}
    </span>
  )
}

export function DriversTable({
  drivers,
  base,
  today,
  canManage,
}: {
  drivers: Driver[]
  /** /org/<slug>/drivers */
  base: string
  /** "YYYY-MM-DD", from the server so both renders warn about the same dates. */
  today: string
  canManage: boolean
}) {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("active")

  const rows = useMemo(
    () =>
      drivers.map((driver) => ({
        driver,
        items: complianceItems(driver, today),
      })),
    [drivers, today]
  )

  const counts = useMemo(() => {
    const byStatus = { active: 0, inactive: 0 }
    for (const driver of drivers) {
      byStatus[driver.status] += 1
    }
    return byStatus
  }, [drivers])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter(
      ({ driver }) =>
        (filter === "all" || driver.status === filter) &&
        driver.full_name.toLowerCase().includes(query)
    )
  }, [rows, filter, search])

  const attention = useMemo(
    () =>
      rows.filter(
        ({ driver, items }) =>
          driver.status === "active" && flagged(items).length > 0
      ).length,
    [rows]
  )

  const addButton = (size: "sm" | "default") =>
    canManage && (
      <Link href={`${base}/new`} className={buttonVariants({ size })}>
        <UserRoundPlus />
        Add driver
      </Link>
    )

  if (drivers.length === 0) {
    return (
      <SettingsCard title="Drivers">
        <SettingsEmptyState icon={UserRoundPlus} title="No drivers yet">
          {canManage
            ? "Add your drivers to keep their CDL, medical card and yearly checks in one place. You'll see a warning here before anything is due."
            : "Owners and admins can add drivers. Once they do, you'll see them here."}
        </SettingsEmptyState>
        {canManage && (
          <div className="mt-4 flex justify-center">{addButton("default")}</div>
        )}
      </SettingsCard>
    )
  }

  const filtering = search.trim() !== "" || filter !== "all"
  const count = filtering
    ? `Showing ${filtered.length} of ${plural(drivers.length, "driver")}`
    : plural(drivers.length, "driver")

  return (
    <SettingsCard
      title="Drivers"
      description="Search by name, or filter by status."
      action={addButton("sm")}
      contentClassName="px-0 pb-0"
      footer={
        <SettingsCardFooter
          hint={
            attention > 0 ? (
              <>
                {count} ·{" "}
                <span className="text-amber-700 dark:text-amber-300">
                  {plural(attention, "active driver")} with something due in the
                  next 60 days
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
            placeholder="Search by name"
            aria-label="Search drivers"
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
          className="shrink-0"
          value={[filter]}
          onValueChange={(value: string[]) =>
            setFilter((value[0] as Filter | undefined) ?? "all")
          }
        >
          {DRIVER_STATUSES.map((status) => (
            <ToggleGroupItem key={status} value={status}>
              {DRIVER_STATUS_LABELS[status]}
              <span className="text-muted-foreground tabular-nums">
                {counts[status]}
              </span>
            </ToggleGroupItem>
          ))}
          <ToggleGroupItem value="all">
            All
            <span className="text-muted-foreground tabular-nums">
              {drivers.length}
            </span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>Driver</TableHead>
            <TableHead className="hidden lg:table-cell">CDL</TableHead>
            <TableHead className="hidden md:table-cell">Pay</TableHead>
            <TableHead className="hidden sm:table-cell">Compliance</TableHead>
            <TableHead className="w-24">Status</TableHead>
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
                  ? `No ${filter} drivers.`
                  : "No drivers match your search."}
              </TableCell>
            </TableRow>
          )}
          {filtered.map(({ driver, items }) => {
            const warnings = driver.status === "active" ? flagged(items) : []
            return (
              <TableRow key={driver.id}>
                <TableCell className="max-w-64 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                        {initials(driver.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <Link
                        href={`${base}/${driver.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {driver.full_name}
                      </Link>
                      <div className="truncate text-sm text-muted-foreground">
                        {driver.phone
                          ? formatPhone(driver.phone)
                          : (driver.email ?? "No contact info")}
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
                  {driver.cdl_number ? (
                    <>
                      <span className="text-foreground">
                        {driver.cdl_number}
                      </span>
                      {driver.cdl_state && ` · ${driver.cdl_state}`}
                    </>
                  ) : (
                    "Not set"
                  )}
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">
                  {formatPay(driver.pay_type, driver.pay_rate) ?? (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </TableCell>
                <TableCell className="hidden max-w-80 text-sm whitespace-normal sm:table-cell">
                  <ComplianceSummary items={items} status={driver.status} />
                </TableCell>
                <TableCell>
                  <DriverStatusBadge status={driver.status} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </SettingsCard>
  )
}
