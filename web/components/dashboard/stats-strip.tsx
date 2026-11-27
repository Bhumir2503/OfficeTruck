import { cn } from "cn"
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Gauge,
  HandCoins,
  PiggyBank,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import {
  change,
  formatDollars,
  formatPerMile,
  type ReportTotals,
} from "@/lib/report-format"

const oneDecimal = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
})

function Stat({
  icon: Icon,
  title,
  before,
  value,
  footer,
  last,
}: {
  icon: LucideIcon
  title: string
  /** The muted line above the value. */
  before: ReactNode
  value: string
  footer: ReactNode
  last?: boolean
}) {
  return (
    <div className="flex items-start">
      <div className="min-w-0 flex-1 space-y-1 sm:space-y-2 lg:space-y-3">
        <div className="flex items-center gap-1.5 text-muted-foreground sm:gap-2">
          <Icon className="size-3.5 sm:size-4" aria-hidden="true" />
          <span className="truncate text-[10px] font-medium sm:text-xs lg:text-sm">
            {title}
          </span>
        </div>
        <p className="hidden truncate text-[10px] text-muted-foreground/70 sm:block sm:text-xs">
          {before}
        </p>
        <p className="text-xl leading-tight font-semibold tracking-tight tabular-nums sm:text-2xl lg:text-[28px]">
          {value}
        </p>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] sm:text-xs">
          {footer}
        </div>
      </div>
      {!last && (
        <div className="mx-4 hidden h-full w-px bg-border lg:block xl:mx-6" />
      )}
    </div>
  )
}

/** "↑ +14.2% vs last month", or a quiet note when there's nothing to compare. */
function VsLastMonth({
  current,
  previous,
}: {
  current: number | null
  previous: number | null
}) {
  const delta = change(current, previous)
  if (delta === null) {
    return (
      <span className="whitespace-nowrap text-muted-foreground">
        Nothing to compare yet
      </span>
    )
  }
  const up = delta >= 0
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  return (
    <>
      <Arrow
        className={cn(
          "size-3 shrink-0 sm:size-3.5",
          up ? "text-emerald-600" : "text-red-600"
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          "whitespace-nowrap",
          up ? "text-emerald-600" : "text-red-600"
        )}
      >
        {up ? "+" : "-"}
        {oneDecimal.format(Math.abs(delta) * 100)}%
      </span>
      <span className="whitespace-nowrap text-muted-foreground">
        vs last month
      </span>
    </>
  )
}

/**
 * This month so far against the same days last month, and what customers
 * still owe, in one strip.
 */
export function StatsStrip({
  current,
  previous,
  owed,
  overdue,
  unpaid,
  invoicesHref,
}: {
  /** This month so far. */
  current: ReportTotals
  /** Last month up to the same day. */
  previous: ReportTotals
  /** Left to pay on sent invoices. */
  owed: number
  /** The part of `owed` that's past due. */
  overdue: number
  /** How many sent invoices aren't paid off. */
  unpaid: number
  invoicesHref: string
}) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 sm:gap-4 sm:p-5 lg:grid-cols-4 lg:gap-6 lg:p-6">
      <Stat
        icon={CircleDollarSign}
        title="Revenue this month"
        before={`${formatDollars(previous.revenue)} by this day last month`}
        value={formatDollars(current.revenue)}
        footer={
          <VsLastMonth current={current.revenue} previous={previous.revenue} />
        }
      />
      <Stat
        icon={PiggyBank}
        title="Profit this month"
        before={`${formatDollars(previous.profit)} by this day last month`}
        value={formatDollars(current.profit)}
        footer={
          <VsLastMonth current={current.profit} previous={previous.profit} />
        }
      />
      <Stat
        icon={Gauge}
        title="Rate per mile"
        before={
          previous.ratePerMile === null
            ? "No miles last month"
            : `${formatPerMile(previous.ratePerMile)} last month`
        }
        value={formatPerMile(current.ratePerMile)}
        footer={
          current.ratePerMile === null ? (
            <span className="text-muted-foreground">
              Add miles to loads to see it
            </span>
          ) : (
            <VsLastMonth
              current={current.ratePerMile}
              previous={previous.ratePerMile}
            />
          )
        }
      />
      <Stat
        icon={HandCoins}
        title="Waiting on pay"
        before={`${unpaid} ${unpaid === 1 ? "invoice" : "invoices"} not paid off`}
        value={formatDollars(owed)}
        footer={
          <>
            <span
              className={cn(
                "whitespace-nowrap",
                overdue > 0 ? "text-red-600" : "text-emerald-600"
              )}
            >
              {overdue > 0
                ? `${formatDollars(overdue)} overdue`
                : "None overdue"}
            </span>
            <Link
              href={invoicesHref}
              className="whitespace-nowrap text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              · Invoices
            </Link>
          </>
        }
        last
      />
    </div>
  )
}
