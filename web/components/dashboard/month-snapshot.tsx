import { cn } from "cn"
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
  href,
  tone,
}: {
  label: string
  value: string
  href?: string
  tone?: "good" | "danger"
}) {
  const text = (
    <dd
      className={cn(
        "font-medium tabular-nums",
        tone === "good" && "text-emerald-700 dark:text-emerald-400",
        tone === "danger" && "text-destructive"
      )}
    >
      {value}
    </dd>
  )
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-muted-foreground">
        {href ? (
          <Link href={href} className="hover:underline">
            {label}
          </Link>
        ) : (
          label
        )}
      </dt>
      {text}
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
    <SettingsCard
      title={monthName}
      action={
        <Link
          href={reportsHref}
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          Reports
        </Link>
      }
      contentClassName="pt-2 pb-4"
    >
      <dl className="divide-y">
        <Row
          label={`Revenue, ${month.loads} ${month.loads === 1 ? "load" : "loads"}`}
          value={formatDollars(month.revenue)}
        />
        <Row
          label="Profit"
          value={`${formatDollars(month.profit)} · ${formatPercent(month.margin)}`}
          tone={
            month.profit > 0 ? "good" : month.profit < 0 ? "danger" : undefined
          }
        />
        <Row label="Rate per mile" value={formatPerMile(month.ratePerMile)} />
        <Row
          label="Waiting on pay"
          value={formatDollars(owed)}
          href={invoicesHref}
        />
        {overdue > 0 && (
          <Row
            label="Past due"
            value={formatDollars(overdue)}
            href={invoicesHref}
            tone="danger"
          />
        )}
      </dl>
    </SettingsCard>
  )
}
