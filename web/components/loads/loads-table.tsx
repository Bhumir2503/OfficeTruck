"use client"

import { ArrowRight, Inbox, PackagePlus } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import {
  LoadRowAction,
  type RowActionContext,
} from "@/components/loads/load-row-action"
import { ListPager, usePage } from "@/components/dashboard/list-pager"
import { LoadStatusMenu } from "@/components/loads/load-status-menu"
import {
  SettingsCard,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { TableFilters, type FilterOption } from "@/components/table-filters"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatRate, formatStopDate } from "@/lib/load-format"
import type { PaymentDue } from "@/lib/load-views"
import type { Load } from "@/lib/loads"
import {
  LOAD_STATUSES,
  LOAD_STATUS_LABELS,
  type LoadStatus,
} from "@/lib/schemas/load"

type Filter = LoadStatus | "all"

/** Rows per page: a company's history runs to thousands of loads. */
const PAGE_SIZE = 50

export function LoadsTable({
  loads,
  payments,
  context,
  base,
  inboxWaiting = 0,
}: {
  loads: Load[]
  /** What the row actions need: the org, drivers, trucks. */
  context: RowActionContext
  /** When each invoiced or factored load is due, by load id. */
  payments: Record<string, PaymentDue>
  /** /org/<slug>/loads */
  base: string
  /** Rate cons in the email inbox waiting to become loads. */
  inboxWaiting?: number
}) {
  const inboxLink = (
    <Link
      href={`${base}/inbox`}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      <Inbox />
      Rate con inbox
      {inboxWaiting > 0 && (
        <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
          {inboxWaiting}
        </span>
      )}
    </Link>
  )
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("all")

  const counts = useMemo(() => {
    const byStatus = Object.fromEntries(
      LOAD_STATUSES.map((status) => [status, 0])
    ) as Record<LoadStatus, number>
    for (const load of loads) {
      byStatus[load.status] += 1
    }
    return byStatus
  }, [loads])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return loads.filter(
      (load) =>
        (filter === "all" || load.status === filter) &&
        (load.reference.toLowerCase().includes(query) ||
          load.broker_name.toLowerCase().includes(query))
    )
  }, [loads, filter, search])
  const { shown, pager } = usePage(filtered, PAGE_SIZE)

  if (loads.length === 0) {
    return (
      <SettingsCard title="All loads">
        <SettingsEmptyState icon={PackagePlus} title="No loads yet">
          Add your first load from its rate confirmation, and track it from
          booked to invoiced here.
        </SettingsEmptyState>
        <div className="mt-4 flex justify-center gap-2">
          {inboxLink}
          <Link href={`${base}/new`} className={buttonVariants()}>
            <PackagePlus />
            New load
          </Link>
        </div>
      </SettingsCard>
    )
  }

  const filtering = search.trim() !== "" || filter !== "all"

  // The status filter's choices, each with how many loads it shows.
  const filterOptions: FilterOption<Filter>[] = [
    { value: "all", name: "All", count: loads.length },
    ...LOAD_STATUSES.map((status) => ({
      value: status,
      name: LOAD_STATUS_LABELS[status],
      count: counts[status],
    })),
  ]

  return (
    <SettingsCard
      title="All loads"
      description="Search by load number or broker, or filter by status."
      action={
        <div className="flex flex-wrap items-center gap-2">
          {inboxLink}
          <Link href={`${base}/new`} className={buttonVariants({ size: "sm" })}>
            <PackagePlus />
            New load
          </Link>
        </div>
      }
      contentClassName="@container px-0 pb-0"
      footer={
        <ListPager
          {...pager}
          noun={
            filtering
              ? `matching loads (${loads.length} in all)`
              : pager.total === 1
                ? "load"
                : "loads"
          }
        />
      }
    >
      <TableFilters
        search={search}
        onSearchChange={(value) => {
          setSearch(value)
          pager.onPage(1)
        }}
        searchPlaceholder="Search load # or broker"
        searchLabel="Search loads"
        filter={filter}
        onFilterChange={(value) => {
          setFilter(value)
          pager.onPage(1)
        }}
        options={filterOptions}
      />
      <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="w-full @4xl:w-px">Load</TableHead>
            <TableHead className="hidden w-full @4xl:table-cell">
              Route
            </TableHead>
            <TableHead className="hidden w-px @2xl:table-cell">
              Pickup
            </TableHead>
            <TableHead className="hidden w-px @4xl:table-cell">
              Driver
            </TableHead>
            <TableHead className="w-px text-right">Rate</TableHead>
            <TableHead className="w-px @max-xl:pr-6">Status</TableHead>
            <TableHead className="hidden w-px text-right @xl:table-cell">
              Action
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={7}
                className="h-24 text-center text-muted-foreground"
              >
                No loads match your search.
              </TableCell>
            </TableRow>
          )}
          {shown.map((load) => (
            <TableRow key={load.id}>
              <TableCell className="py-3 @max-4xl:max-w-0">
                <Link
                  href={`${base}/${load.id}`}
                  className="block truncate font-medium hover:underline"
                >
                  {load.reference}
                </Link>
                <div className="truncate text-sm text-muted-foreground">
                  {load.broker_name}
                </div>
              </TableCell>
              <TableCell className="hidden max-w-0 @4xl:table-cell">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="truncate">{load.pickup_location}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{load.delivery_location}</span>
                </div>
              </TableCell>
              <TableCell className="hidden text-muted-foreground @2xl:table-cell">
                {formatStopDate(load.pickup_start)}
              </TableCell>
              <TableCell className="hidden @4xl:table-cell">
                <div className="max-w-40 truncate text-sm">
                  {load.driver?.full_name ?? load.driver_name ?? (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatRate(load.rate)}
              </TableCell>
              <TableCell className="@max-xl:pr-6">
                <LoadStatusMenu
                  organizationId={context.organizationId}
                  load={load}
                />
              </TableCell>
              <TableCell className="hidden text-right text-sm @xl:table-cell">
                <LoadRowAction
                  load={load}
                  due={payments[load.id]}
                  context={context}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SettingsCard>
  )
}
