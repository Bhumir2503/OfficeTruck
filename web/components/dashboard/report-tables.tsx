"use client"

import { cn } from "cn"
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Eye,
  Filter,
  Landmark,
  Layers,
  MoreHorizontal,
  PackageCheck,
  Receipt,
  Search,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import {
  EmptyRow,
  HEAD,
  HEAD_ROW,
  TableCard,
} from "@/components/dashboard/table-panel"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { initials } from "@/lib/initials"
import { formatRate, formatStopDate } from "@/lib/load-format"
import {
  breakdown,
  BREAKDOWN_LABELS,
  BREAKDOWNS,
  formatDollars,
  formatMiles,
  formatPercent,
  formatPerMile,
  inPeriod,
  loadProfit,
  PERIOD_LABELS,
  PERIODS,
  REPORTED_STATUSES,
  totals,
  type Breakdown,
  type BreakdownRow,
  type Period,
  type ReportLoad,
} from "@/lib/report-format"
import { LOAD_STATUS_LABELS, type LoadStatus } from "@/lib/schemas/load"

type View = "loads" | Breakdown
const VIEW_LABELS: Record<View, string> = {
  loads: "Each load",
  truck: "By truck",
  driver: "By driver",
  broker: "By customer",
  lane: "By lane",
}
const VIEWS: View[] = ["loads", ...BREAKDOWNS]

type Sort = "newest" | "least" | "most"
const SORT_LABELS: Record<Sort, string> = {
  newest: "Newest first",
  least: "Least profitable",
  most: "Most profitable",
}

type StatusFilter = LoadStatus | "all"

/** Delivered loads, by how far along getting paid they are. */
const STATUS_STYLES: Partial<Record<LoadStatus, string>> = {
  delivered:
    "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-400/20",
  invoiced:
    "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-400/20",
  paid: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-400/20",
  factored:
    "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20 dark:bg-violet-900/30 dark:text-violet-400 dark:ring-violet-400/20",
}
const STATUS_ICONS: Partial<Record<LoadStatus, LucideIcon>> = {
  delivered: Clock,
  invoiced: Receipt,
  paid: CheckCircle2,
  factored: Landmark,
}

const PAGE_SIZES = [10, 20, 50]

const chip =
  "inline-flex h-5 cursor-pointer items-center gap-1 rounded-md bg-muted px-2 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border sm:h-6 sm:text-xs"

const count = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

/** Loads whose numbers are off, so the profit and per-mile figures are too. */
function DataWarning({ loads }: { loads: ReportLoad[] }) {
  const sum = useMemo(() => totals(loads), [loads])
  if (sum.payUnknown === 0 && sum.noMiles === 0) return null
  return (
    <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs sm:text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="text-muted-foreground">
        {sum.payUnknown > 0 && (
          <>
            {count(sum.payUnknown, "load")}{" "}
            {sum.payUnknown === 1 ? "has" : "have"} per-mile driver pay but no
            miles, so their pay isn&apos;t counted and profit looks higher than
            it is.{" "}
          </>
        )}
        {sum.noMiles > 0 && (
          <>
            {count(sum.noMiles, "load")} {sum.noMiles === 1 ? "has" : "have"} no
            loaded miles, so per-mile figures leave{" "}
            {sum.noMiles === 1 ? "it" : "them"} out.
          </>
        )}{" "}
        Add miles on the load to fix this.
      </p>
    </div>
  )
}

const recordPath: Record<Breakdown, string | null> = {
  truck: "equipment",
  driver: "drivers",
  broker: "customers",
  lane: null,
}

function LoadRows({
  loads,
  orgBase,
}: {
  loads: ReportLoad[]
  orgBase: string
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className={HEAD_ROW}>
          <TableHead className={cn(HEAD, "min-w-[100px]")}>Load</TableHead>
          <TableHead className={cn(HEAD, "hidden min-w-[140px] md:table-cell")}>
            Customer
          </TableHead>
          <TableHead className={cn(HEAD, "text-right")}>Revenue</TableHead>
          <TableHead className={cn(HEAD, "hidden text-right lg:table-cell")}>
            Driver pay
          </TableHead>
          <TableHead className={cn(HEAD, "hidden text-right lg:table-cell")}>
            Expenses
          </TableHead>
          <TableHead className={cn(HEAD, "text-right")}>Profit</TableHead>
          <TableHead className={cn(HEAD, "hidden sm:table-cell")}>
            Delivered
          </TableHead>
          <TableHead className={cn(HEAD, "min-w-[100px]")}>Status</TableHead>
          <TableHead className="w-[40px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {loads.map((load) => {
          const profit = loadProfit(load)
          const StatusIcon = STATUS_ICONS[load.status]
          return (
            <TableRow key={load.id}>
              <TableCell className="max-w-[180px]">
                <Link
                  href={`${orgBase}/loads/${load.id}`}
                  className="text-xs font-medium hover:underline sm:text-sm"
                >
                  {load.reference}
                </Link>
                <p className="truncate text-[10px] text-muted-foreground sm:text-xs">
                  {load.origin} → {load.destination}
                </p>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <div className="flex items-center gap-2">
                  <Avatar className="size-6 bg-muted">
                    <AvatarFallback className="text-[8px] font-semibold text-muted-foreground uppercase">
                      {initials(load.broker.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="max-w-[160px] truncate text-xs text-muted-foreground sm:text-sm">
                    {load.broker.name}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums sm:text-sm">
                {formatRate(load.rate)}
              </TableCell>
              <TableCell className="hidden text-right text-xs tabular-nums sm:text-sm lg:table-cell">
                {load.driver_pay === null ? (
                  <span
                    className="text-muted-foreground"
                    title={
                      load.pay_unknown
                        ? "Per-mile pay on a load with no miles"
                        : "No pay rate on this load"
                    }
                  >
                    —
                  </span>
                ) : (
                  formatRate(load.driver_pay)
                )}
              </TableCell>
              <TableCell className="hidden text-right text-xs tabular-nums sm:text-sm lg:table-cell">
                {load.expenses ? formatRate(load.expenses) : "—"}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right text-xs font-medium tabular-nums sm:text-sm",
                  profit < 0 && "text-red-600"
                )}
              >
                {formatRate(profit)}
              </TableCell>
              <TableCell className="hidden text-xs whitespace-nowrap text-muted-foreground sm:table-cell sm:text-sm">
                {formatStopDate(`${load.delivered_on}T00:00:00`)}
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium whitespace-nowrap sm:text-xs",
                    STATUS_STYLES[load.status] ??
                      "bg-muted text-muted-foreground"
                  )}
                >
                  {StatusIcon && (
                    <StatusIcon className="size-3" aria-hidden="true" />
                  )}
                  {LOAD_STATUS_LABELS[load.status]}
                </span>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground sm:size-8"
                        aria-label={`Open actions for ${load.reference}`}
                      />
                    }
                  >
                    <MoreHorizontal className="size-3.5 sm:size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      render={<Link href={`${orgBase}/loads/${load.id}`} />}
                    >
                      <Eye className="size-4" aria-hidden="true" />
                      View load
                    </DropdownMenuItem>
                    {load.broker.id && (
                      <DropdownMenuItem
                        render={
                          <Link
                            href={`${orgBase}/customers/${load.broker.id}`}
                          />
                        }
                      >
                        <PackageCheck className="size-4" aria-hidden="true" />
                        View customer
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function BreakdownRows({
  rows,
  by,
  orgBase,
}: {
  rows: BreakdownRow[]
  by: Breakdown
  orgBase: string
}) {
  const path = recordPath[by]
  return (
    <Table>
      <TableHeader>
        <TableRow className={HEAD_ROW}>
          <TableHead className={cn(HEAD, "w-full")}>
            {BREAKDOWN_LABELS[by]}
          </TableHead>
          <TableHead className={cn(HEAD, "text-right")}>Loads</TableHead>
          <TableHead className={cn(HEAD, "text-right")}>Revenue</TableHead>
          <TableHead className={cn(HEAD, "hidden text-right lg:table-cell")}>
            Miles
          </TableHead>
          <TableHead className={cn(HEAD, "hidden text-right md:table-cell")}>
            Rate / mi
          </TableHead>
          <TableHead className={cn(HEAD, "hidden text-right xl:table-cell")}>
            Cost / mi
          </TableHead>
          <TableHead className={cn(HEAD, "hidden text-right xl:table-cell")}>
            Empty
          </TableHead>
          <TableHead className={cn(HEAD, "text-right")}>Profit</TableHead>
          <TableHead className={cn(HEAD, "hidden text-right sm:table-cell")}>
            Margin
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="max-w-0 truncate text-xs sm:text-sm">
              {path && row.id ? (
                <Link
                  href={`${orgBase}/${path}/${row.id}`}
                  className="font-medium hover:underline"
                >
                  {row.name}
                </Link>
              ) : (
                <span
                  className={cn(
                    "font-medium",
                    !row.id && by !== "lane" && "text-muted-foreground"
                  )}
                >
                  {row.name}
                </span>
              )}
            </TableCell>
            <TableCell className="text-right text-xs tabular-nums sm:text-sm">
              {row.loads}
            </TableCell>
            <TableCell className="text-right text-xs tabular-nums sm:text-sm">
              {formatDollars(row.revenue)}
            </TableCell>
            <TableCell className="hidden text-right text-xs tabular-nums sm:text-sm lg:table-cell">
              {formatMiles(row.loadedMiles)}
            </TableCell>
            <TableCell className="hidden text-right text-xs tabular-nums sm:text-sm md:table-cell">
              {formatPerMile(row.ratePerMile)}
            </TableCell>
            <TableCell className="hidden text-right text-xs tabular-nums sm:text-sm xl:table-cell">
              {formatPerMile(row.costPerMile)}
            </TableCell>
            <TableCell className="hidden text-right text-xs tabular-nums sm:text-sm xl:table-cell">
              {formatPercent(row.emptyShare)}
            </TableCell>
            <TableCell
              className={cn(
                "text-right text-xs font-medium tabular-nums sm:text-sm",
                row.profit < 0 && "text-red-600"
              )}
            >
              {formatDollars(row.profit)}
            </TableCell>
            <TableCell className="hidden text-right text-xs tabular-nums sm:table-cell sm:text-sm">
              {formatPercent(row.margin)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * Every delivered load with what it made, searchable and filterable, or the
 * same loads added up by truck, driver, customer or lane.
 */
export function DeliveredLoadsCard({
  loads,
  today,
  orgBase,
}: {
  /** Delivered or further along, newest delivery first. */
  loads: ReportLoad[]
  /** "YYYY-MM-DD", from the server so the render matches. */
  today: string
  /** /org/<slug> */
  orgBase: string
}) {
  const [search, setSearch] = useState("")
  const [period, setPeriod] = useState<Period>("this_month")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [view, setView] = useState<View>("loads")
  const [sort, setSort] = useState<Sort>("newest")
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const list = loads.filter(
      (load) =>
        inPeriod(load, period, today) &&
        (status === "all" || load.status === status) &&
        (query === "" ||
          [
            load.reference,
            load.broker.name,
            load.origin,
            load.destination,
            load.truck?.name,
            load.driver?.name,
          ].some((value) => value?.toLowerCase().includes(query)))
    )
    if (sort === "least") list.sort((a, b) => loadProfit(a) - loadProfit(b))
    if (sort === "most") list.sort((a, b) => loadProfit(b) - loadProfit(a))
    return list
  }, [loads, period, today, status, search, sort])

  const rows = useMemo(
    () => (view === "loads" ? null : breakdown(filtered, view)),
    [filtered, view]
  )
  const total = rows ? rows.length : filtered.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pages)
  const from = (current - 1) * pageSize
  const goTo = (next: number) => setPage(Math.max(1, Math.min(next, pages)))
  // Any change to what's listed starts again from the first page.
  const reset =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setPage(1)
    }

  const filtering = status !== "all" || view !== "loads" || sort !== "newest"
  const periodItems = PERIODS.map((value) => ({
    value,
    label: PERIOD_LABELS[value],
  }))

  return (
    <TableCard
      icon={PackageCheck}
      title="Delivered loads"
      count={filtered.length}
      actions={
        <>
          <div className="relative w-full sm:w-auto">
            <Search
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search delivered loads"
              placeholder="Search load, customer, lane…"
              value={search}
              onChange={(event) => reset(setSearch)(event.target.value)}
              className="h-8 w-full pl-9 text-sm sm:h-9 sm:w-[180px] lg:w-[220px]"
            />
          </div>
          <Select
            value={period}
            onValueChange={(value) => {
              if (value !== null) reset(setPeriod)(value as Period)
            }}
            items={periodItems}
          >
            <SelectTrigger
              className="h-8 w-[130px] text-xs sm:h-9 sm:w-[150px] sm:text-sm"
              aria-label="Period"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periodItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 gap-1.5 sm:h-9 sm:gap-2",
                    status !== "all" && "border-primary"
                  )}
                  aria-label="Filter by status"
                />
              }
            >
              <Filter className="size-3.5 sm:size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Status</span>
              {status !== "all" && (
                <span className="size-1.5 rounded-full bg-primary sm:size-2" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[180px]">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={status}
                  onValueChange={(value) =>
                    reset(setStatus)(value as StatusFilter)
                  }
                >
                  <DropdownMenuRadioItem value="all">
                    All statuses
                  </DropdownMenuRadioItem>
                  {REPORTED_STATUSES.map((key) => (
                    <DropdownMenuRadioItem key={key} value={key}>
                      {LOAD_STATUS_LABELS[key]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 gap-1.5 sm:h-9 sm:gap-2",
                    (view !== "loads" || sort !== "newest") && "border-primary"
                  )}
                  aria-label="View"
                />
              }
            >
              <Layers className="size-3.5 sm:size-4" aria-hidden="true" />
              <span className="hidden sm:inline">View</span>
              {(view !== "loads" || sort !== "newest") && (
                <span className="size-1.5 rounded-full bg-primary sm:size-2" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Show</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={view}
                  onValueChange={(value) => reset(setView)(value as View)}
                >
                  {VIEWS.map((key) => (
                    <DropdownMenuRadioItem key={key} value={key}>
                      {VIEW_LABELS[key]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
              {view === "loads" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Sort</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={sort}
                      onValueChange={(value) => reset(setSort)(value as Sort)}
                    >
                      {(Object.keys(SORT_LABELS) as Sort[]).map((key) => (
                        <DropdownMenuRadioItem key={key} value={key}>
                          {SORT_LABELS[key]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuGroup>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
      filters={
        filtering && (
          <div className="flex flex-wrap items-center gap-2 px-3 pb-3 sm:px-6">
            <span className="text-[10px] text-muted-foreground sm:text-xs">
              Filters:
            </span>
            {status !== "all" && (
              <button
                type="button"
                className={chip}
                onClick={() => reset(setStatus)("all")}
                aria-label={`Clear ${LOAD_STATUS_LABELS[status]} filter`}
              >
                {LOAD_STATUS_LABELS[status]}
                <X className="size-2.5 sm:size-3" aria-hidden="true" />
              </button>
            )}
            {view !== "loads" && (
              <button
                type="button"
                className={chip}
                onClick={() => reset(setView)("loads")}
                aria-label={`Clear ${VIEW_LABELS[view]} view`}
              >
                {VIEW_LABELS[view]}
                <X className="size-2.5 sm:size-3" aria-hidden="true" />
              </button>
            )}
            {view === "loads" && sort !== "newest" && (
              <button
                type="button"
                className={chip}
                onClick={() => reset(setSort)("newest")}
                aria-label={`Clear ${SORT_LABELS[sort]} sort`}
              >
                {SORT_LABELS[sort]}
                <X className="size-2.5 sm:size-3" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setStatus("all")
                setView("loads")
                setSort("newest")
                setPage(1)
              }}
              className="text-[10px] text-destructive hover:underline sm:text-xs"
            >
              Clear all
            </button>
          </div>
        )
      }
      footer={
        <>
          <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
            <span className="hidden sm:inline">Rows per page:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                if (value === null) return
                setPageSize(Number(value))
                setPage(1)
              }}
            >
              <SelectTrigger
                className="h-8 w-[70px]"
                aria-label="Rows per page"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>
              {total === 0
                ? "0"
                : `${from + 1}-${Math.min(from + pageSize, total)}`}{" "}
              of {total}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => goTo(1)}
              disabled={current === 1}
              aria-label="Go to first page"
            >
              <ChevronsLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => goTo(current - 1)}
              disabled={current === 1}
              aria-label="Go to previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2 text-xs text-muted-foreground tabular-nums sm:text-sm">
              Page {current} of {pages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => goTo(current + 1)}
              disabled={current === pages}
              aria-label="Go to next page"
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => goTo(pages)}
              disabled={current === pages}
              aria-label="Go to last page"
            >
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </>
      }
    >
      <DataWarning loads={filtered} />
      {total === 0 ? (
        <EmptyRow>
          {search.trim() || status !== "all"
            ? "No delivered loads match your filters."
            : `No delivered loads ${period === "all" ? "yet" : PERIOD_LABELS[period].toLowerCase()}.`}
        </EmptyRow>
      ) : rows && view !== "loads" ? (
        <BreakdownRows
          rows={rows.slice(from, from + pageSize)}
          by={view}
          orgBase={orgBase}
        />
      ) : (
        <LoadRows
          loads={filtered.slice(from, from + pageSize)}
          orgBase={orgBase}
        />
      )}
    </TableCard>
  )
}
