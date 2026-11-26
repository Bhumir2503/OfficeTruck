import { cn } from "cn"
import { CircleAlert, CircleCheck, OctagonX } from "lucide-react"

import type { FmcsaFlag } from "@/lib/broker-format"
import { formatTerms } from "@/lib/broker-format"
import type { BrokerPaymentStats } from "@/lib/invoice-format"
import { formatRate, formatStopDate } from "@/lib/load-format"

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

function Row({
  label,
  children,
  tone,
}: {
  label: string
  children: React.ReactNode
  tone?: "warn" | "bad"
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-right font-medium tabular-nums",
          tone === "warn" && "text-amber-700 dark:text-amber-300",
          tone === "bad" && "text-destructive"
        )}
      >
        {children}
      </dd>
    </div>
  )
}

/**
 * Beside the customer page, like the truck page's Next action: whether
 * they're safe to book, then how they pay, what they owe and how much work
 * they send.
 */
export function CustomerGlance({
  kind,
  doNotUse,
  flags,
  checked,
  termsDays,
  quickPay,
  stats,
  loads,
}: {
  kind: "broker" | "shipper"
  doNotUse: boolean
  /** FMCSA flags, worst first. */
  flags: FmcsaFlag[]
  /** Whether FMCSA has been checked. */
  checked: boolean
  termsDays: number
  quickPay: number | null
  stats: BrokerPaymentStats
  loads: { count: number; booked: number; last: string | null }
}) {
  const danger = flags.find((flag) => flag.tone === "danger")
  const slow =
    stats.avgDaysToPay !== null && stats.avgDaysToPay > Math.max(termsDays, 1)

  const headline = doNotUse
    ? {
        icon: OctagonX,
        title: "Do not use",
        detail: "New loads with them show a warning.",
        tone: "bad" as const,
      }
    : danger
      ? {
          icon: OctagonX,
          title: danger.text,
          detail: "Check their authority before booking another load.",
          tone: "bad" as const,
        }
      : stats.overdue.count > 0
        ? {
            icon: CircleAlert,
            title: `${formatRate(stats.overdue.balance)} overdue`,
            detail: `${plural(stats.overdue.count, "invoice")} past terms. Worth a call before the next load.`,
            tone: "warn" as const,
          }
        : flags.length > 0
          ? {
              icon: CircleAlert,
              title: flags[0].text,
              detail: "Not a reason to stop, but worth a look.",
              tone: "warn" as const,
            }
          : {
              icon: CircleCheck,
              title: "Good to book",
              detail:
                kind === "broker" && !checked
                  ? "Not checked with FMCSA yet."
                  : "Nothing overdue, nothing flagged.",
              tone: "good" as const,
            }
  const Icon = headline.icon

  return (
    <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
      <div className="px-5 pt-4 pb-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          At a glance
        </p>
        <h4
          className={cn(
            "mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight",
            headline.tone === "good" &&
              "text-emerald-700 dark:text-emerald-300",
            headline.tone === "warn" && "text-amber-700 dark:text-amber-300",
            headline.tone === "bad" && "text-destructive"
          )}
        >
          <Icon className="size-5 shrink-0" aria-hidden />
          {headline.title}
        </h4>
        <p className="mt-1 text-sm text-muted-foreground">{headline.detail}</p>
        <dl className="mt-3 divide-y border-t">
          <Row label="Terms">{formatTerms(termsDays, quickPay)}</Row>
          <Row label="Pays in" tone={slow ? "warn" : undefined}>
            {stats.avgDaysToPay === null
              ? "—"
              : `${stats.avgDaysToPay} ${stats.avgDaysToPay === 1 ? "day" : "days"} avg`}
          </Row>
          <Row label="Open" tone={stats.overdue.count > 0 ? "warn" : undefined}>
            {stats.open.count
              ? `${formatRate(stats.open.balance)} · ${plural(stats.open.count, "invoice")}`
              : "—"}
          </Row>
          <Row label="Loads">
            {loads.count
              ? `${loads.count} · ${formatRate(loads.booked)}`
              : "None yet"}
          </Row>
          <Row label="Last load">
            {loads.last ? formatStopDate(loads.last) : "—"}
          </Row>
        </dl>
      </div>
    </section>
  )
}
