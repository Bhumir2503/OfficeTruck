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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  complianceItems,
  formatPay,
  type DqComplianceDates,
  needsAction,
  type ComplianceItem,
  LAST_DELIVERY_DAYS,
} from "@/lib/driver-format"
import type { Driver, DriverLastDelivery, DriverNow } from "@/lib/drivers"
import { initials } from "@/lib/initials"
import { formatStopDate, STATUS_STYLES } from "@/lib/load-format"
import { formatPhone } from "@/lib/phone"
import {
  DRIVER_STATUSES,
  DRIVER_STATUS_LABELS,
  type DriverStatus,
} from "@/lib/schemas/driver"
import { LOAD_STATUS_LABELS } from "@/lib/schemas/load"

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

/**
 * What a driver is doing now: the load they're on, or Available with their
 * next booked load. Its links sit above the row's own link.
 */
function NowCell({
  status,
  now,
  loadsBase,
}: {
  status: Driver["status"]
  now: DriverNow | undefined
  loadsBase: string
}) {
  if (status === "inactive") {
    return <span className="text-sm text-muted-foreground">—</span>
  }
  const current = now?.current
  if (current) {
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link
            href={`${loadsBase}/${current.id}`}
            className="relative z-10 font-medium tabular-nums hover:underline"
          >
            {current.reference}
          </Link>
          <span
            className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[current.status]}`}
          >
            {LOAD_STATUS_LABELS[current.status]}
          </span>
        </div>
        <div className="truncate text-sm text-muted-foreground">
          {current.from} → {current.to}
        </div>
      </div>
    )
  }
  const next = now?.next
  return (
    <div className="min-w-0">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Available
      </span>
      {next && (
        <div className="truncate text-sm text-muted-foreground">
          Next:{" "}
          <Link
            href={`${loadsBase}/${next.id}`}
            className="relative z-10 tabular-nums hover:underline"
          >
            {next.reference}
          </Link>{" "}
          · picks up {formatStopDate(next.pickup_start)}
        </div>
      )}
    </div>
  )
}

/**
 * On a phone, where the Now column is hidden: what the driver is doing, in
 * one line under their name. Plain text; the row opens the driver.
 */
function NowLine({
  status,
  now,
}: {
  status: Driver["status"]
  now: DriverNow | undefined
}) {
  if (status === "inactive") return null
  const current = now?.current
  if (current) {
    return (
      <div className="mt-1 truncate text-xs md:hidden">
        <span
          className={`mr-1.5 rounded-md px-1.5 py-0.5 font-medium ${STATUS_STYLES[current.status]}`}
        >
          {LOAD_STATUS_LABELS[current.status]}
        </span>
        <span className="text-muted-foreground">
          {current.from} → {current.to}
        </span>
      </div>
    )
  }
  return (
    <div className="mt-1 truncate text-xs md:hidden">
      <span className="font-medium text-emerald-700 dark:text-emerald-300">
        Available
      </span>
      {now?.next && (
        <span className="text-muted-foreground">
          {" "}
          · next picks up {formatStopDate(now.next.pickup_start)}
        </span>
      )}
    </div>
  )
}

/** Whole days from one "YYYY-MM-DD" date to another. */
function daysBetween(from: string, to: string) {
  const day = (value: string) => Date.parse(`${value.slice(0, 10)}T00:00:00Z`)
  return Math.round((day(to) - day(from)) / 86_400_000)
}

/** When and where a driver last delivered, and how long ago. */
function LastDeliveryCell({
  last,
  today,
  loadsBase,
}: {
  last: DriverLastDelivery | null
  /** "YYYY-MM-DD" */
  today: string
  loadsBase: string
}) {
  if (!last) {
    return (
      <span className="text-sm text-muted-foreground">
        None in {LAST_DELIVERY_DAYS} days
      </span>
    )
  }
  const days = Math.max(0, daysBetween(last.delivered_on, today))
  const ago =
    days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`
  return (
    <div className="min-w-0">
      <Link
        href={`${loadsBase}/${last.id}`}
        title={`Load ${last.reference}`}
        className="relative z-10 text-sm font-medium hover:underline"
      >
        {ago}
      </Link>
      <div className="truncate text-sm text-muted-foreground">
        {formatStopDate(`${last.delivered_on}T00:00`)} · {last.to}
      </div>
    </div>
  )
}

export function DriversTable({
  drivers,
  base,
  today,
  canManage,
  dqDates,
  now,
  loadsBase,
}: {
  drivers: Driver[]
  /** /org/<slug>/drivers */
  base: string
  /** "YYYY-MM-DD", from the server so both renders warn about the same dates. */
  today: string
  canManage: boolean
  /** Each driver's file dates (medical, annual review, Clearinghouse). */
  dqDates: Record<string, DqComplianceDates>
  /** The load each driver is on now, their next booked one and their last delivery. */
  now: Record<string, DriverNow>
  /** /org/<slug>/loads */
  loadsBase: string
}) {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("active")

  const rows = useMemo(
    () =>
      drivers.map((driver) => ({
        driver,
        items: complianceItems(driver, dqDates[driver.id], today),
      })),
    [drivers, dqDates, today]
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

  // The status filter's choices, each with how many drivers it shows.
  const filterOptions: {
    value: Filter
    name: string
    label: string
    count: number
  }[] = [
    ...DRIVER_STATUSES.map((status) => ({
      value: status,
      name: DRIVER_STATUS_LABELS[status],
      count: counts[status],
    })),
    { value: "all" as const, name: "All", count: drivers.length },
  ].map((option) => ({
    ...option,
    // What the closed dropdown shows.
    label: `${option.name} (${option.count})`,
  }))

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
        <Select
          value={filter}
          onValueChange={(value) =>
            setFilter((value as Filter | null) ?? "all")
          }
          items={filterOptions}
        >
          <SelectTrigger
            aria-label="Filter by status"
            className="w-full shrink-0 sm:w-40"
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
            <TableHead>Driver</TableHead>
            <TableHead className="hidden md:table-cell">Now</TableHead>
            <TableHead className="hidden lg:table-cell">
              Last delivery
            </TableHead>
            <TableHead className="hidden xl:table-cell">Pay rate</TableHead>
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
                  ? `No ${filter} drivers.`
                  : "No drivers match your search."}
              </TableCell>
            </TableRow>
          )}
          {filtered.map(({ driver, items }) => {
            const warnings = driver.status === "active" ? flagged(items) : []
            return (
              // The name's link covers the whole row, so any of it opens
              // the driver; the load links sit above it.
              <TableRow key={driver.id} className="relative cursor-pointer">
                <TableCell className="max-w-64 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                        {initials(driver.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link
                          href={`${base}/${driver.id}`}
                          className="truncate font-medium after:absolute after:inset-0 hover:underline"
                        >
                          {driver.full_name}
                        </Link>
                        {driver.status === "inactive" && (
                          <DriverStatusBadge
                            status={driver.status}
                            className="shrink-0"
                          />
                        )}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">
                        {driver.phone
                          ? formatPhone(driver.phone)
                          : (driver.email ?? "No contact info")}
                      </div>
                      <NowLine status={driver.status} now={now[driver.id]} />
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
                    status={driver.status}
                    now={now[driver.id]}
                    loadsBase={loadsBase}
                  />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <LastDeliveryCell
                    last={now[driver.id]?.last ?? null}
                    today={today}
                    loadsBase={loadsBase}
                  />
                </TableCell>
                <TableCell className="hidden text-sm xl:table-cell">
                  {formatPay(driver.pay_type, driver.pay_rate) ?? (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </TableCell>
                <TableCell className="hidden max-w-80 text-sm whitespace-normal sm:table-cell">
                  <ComplianceSummary items={items} status={driver.status} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </SettingsCard>
  )
}
