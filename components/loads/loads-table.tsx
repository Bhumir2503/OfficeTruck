"use client"

import { ArrowRight, PackagePlus, Search } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { LoadStatusMenu } from "@/components/loads/load-status-menu"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
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
import { formatRate, formatStopDate } from "@/lib/load-format"
import type { Load } from "@/lib/loads"
import {
  LOAD_STATUSES,
  LOAD_STATUS_LABELS,
  type LoadStatus,
} from "@/lib/schemas/load"

type Filter = LoadStatus | "all"

export function LoadsTable({
  loads,
  organizationId,
  base,
}: {
  loads: Load[]
  organizationId: string
  /** /org/<slug>/loads */
  base: string
}) {
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

  if (loads.length === 0) {
    return (
      <SettingsCard title="All loads">
        <SettingsEmptyState icon={PackagePlus} title="No loads yet">
          Add your first load from its rate confirmation, and track it from
          booked to invoiced here.
        </SettingsEmptyState>
        <div className="mt-4 flex justify-center">
          <Link href={`${base}/new`} className={buttonVariants()}>
            <PackagePlus />
            New load
          </Link>
        </div>
      </SettingsCard>
    )
  }

  const filtering = search.trim() !== "" || filter !== "all"

  return (
    <SettingsCard
      title="All loads"
      description="Search by load number or broker, or filter by status."
      action={
        <Link href={`${base}/new`} className={buttonVariants({ size: "sm" })}>
          <PackagePlus />
          New load
        </Link>
      }
      contentClassName="px-0 pb-0"
      footer={
        <SettingsCardFooter
          hint={
            filtering
              ? `Showing ${filtered.length} of ${loads.length} ${loads.length === 1 ? "load" : "loads"}`
              : `${loads.length} ${loads.length === 1 ? "load" : "loads"}`
          }
        />
      }
    >
      <div className="flex flex-col gap-3 px-6 pb-4">
        <div className="relative w-full">
          <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search load # or broker"
            aria-label="Search loads"
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
          className="flex-wrap"
          value={[filter]}
          onValueChange={(value: string[]) =>
            setFilter((value[0] as Filter | undefined) ?? "all")
          }
        >
          <ToggleGroupItem value="all">All {loads.length}</ToggleGroupItem>
          {LOAD_STATUSES.map((status) => (
            <ToggleGroupItem key={status} value={status}>
              {LOAD_STATUS_LABELS[status]}
              <span className="text-muted-foreground tabular-nums">
                {counts[status]}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>Load</TableHead>
            <TableHead className="hidden md:table-cell">Route</TableHead>
            <TableHead className="hidden sm:table-cell">Pickup</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="w-32">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={5}
                className="h-24 text-center text-muted-foreground"
              >
                No loads match your search.
              </TableCell>
            </TableRow>
          )}
          {filtered.map((load) => (
            <TableRow key={load.id}>
              <TableCell className="max-w-56 py-3">
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
              <TableCell className="hidden max-w-72 md:table-cell">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="truncate">{load.pickup_location}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{load.delivery_location}</span>
                </div>
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">
                {formatStopDate(load.pickup_start)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatRate(load.rate)}
              </TableCell>
              <TableCell>
                <LoadStatusMenu organizationId={organizationId} load={load} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SettingsCard>
  )
}
