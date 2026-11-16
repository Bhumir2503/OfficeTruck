import { cn } from "cn"
import { ArrowRightIcon } from "lucide-react"
import Link from "next/link"

import { SettingsCard } from "@/components/settings/settings-card"
import {
  formatDollars,
  formatPercent,
  formatPerMile,
  type ReportTotals,
} from "@/lib/report-format"

function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "good" | "danger"
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-medium tabular-nums",
          tone === "good" && "text-emerald-700 dark:text-emerald-400",
          tone === "danger" && "text-destructive"
        )}
      >
        {value}
      </dd>
    </div>
  )
}

/** This month so far, and what brokers still owe. */
export function MonthSnapshot({
  month,
  monthName,
  owed,
  overdue,
  reportsHref,
  invoicesHref,
}: {
  month: ReportTotals
  /** "November" */
  monthName: string
  /** Left to pay on sent invoices. */
  owed: number
  /** The part of `owed` that's past due. */
  overdue: number
  reportsHref: string
  invoicesHref: string
}) {
  return (
    <>
      <SettingsCard
        title={`${monthName} so far`}
        description={`${month.loads} delivered ${month.loads === 1 ? "load" : "loads"}.`}
        contentClassName="pt-2 pb-4"
      >
        <dl className="divide-y">
          <Row label="Revenue" value={formatDollars(month.revenue)} />
          <Row
            label="Profit"
            value={`${formatDollars(month.profit)} · ${formatPercent(month.margin)}`}
            tone={
              month.profit > 0
                ? "good"
                : month.profit < 0
                  ? "danger"
                  : undefined
            }
          />
          <Row label="Rate per mile" value={formatPerMile(month.ratePerMile)} />
          <Row label="Cost per mile" value={formatPerMile(month.costPerMile)} />
        </dl>
        <Link
          href={reportsHref}
          className="mt-2 flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
        >
          See reports
          <ArrowRightIcon className="size-4" />
        </Link>
      </SettingsCard>
      <SettingsCard
        title="Owed to you"
        description="Left to pay on sent invoices."
        contentClassName="pt-2 pb-4"
      >
        <dl className="divide-y">
          <Row label="Waiting on pay" value={formatDollars(owed)} />
          <Row
            label="Past due"
            value={formatDollars(overdue)}
            tone={overdue > 0 ? "danger" : undefined}
          />
        </dl>
        <Link
          href={invoicesHref}
          className="mt-2 flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
        >
          See invoices
          <ArrowRightIcon className="size-4" />
        </Link>
      </SettingsCard>
    </>
  )
}
