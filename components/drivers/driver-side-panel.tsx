import { cn } from "cn"
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  Plus,
} from "lucide-react"
import Link from "next/link"

import { ExpiryBadge } from "@/components/drivers/driver-badges"
import { DriverStatusButton } from "@/components/drivers/driver-status-button"
import { MoneyLine, Panel } from "@/components/side-panel"
import { buttonVariants } from "@/components/ui/button"
import {
  driverEarnings,
  driverNextStep,
  formatDate,
  formatPay,
  needsAction,
  type ComplianceItem,
  type PayTotal,
} from "@/lib/driver-format"
import type { Driver, DriverLoad } from "@/lib/drivers"
import { formatRate } from "@/lib/load-format"

const miles = new Intl.NumberFormat("en-US")

/** Where the "Needs attention" "Update dates" button and the photo links go. */
export const DRIVER_DATES_ID = "compliance-dates"
export const DRIVER_DOCUMENTS_ID = "documents"

function ItemIcon({ item, warn }: { item: ComplianceItem; warn: boolean }) {
  const state = item.expiry.state
  if (state === "missing") {
    return <Circle className="size-4 shrink-0 text-muted-foreground" />
  }
  if (warn && state === "expired") {
    return <AlertTriangle className="size-4 shrink-0 text-destructive" />
  }
  if (warn && needsAction(state)) {
    return (
      <Clock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
    )
  }
  return (
    <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
  )
}

function PayRow({ label, total }: { label: string; total: PayTotal }) {
  return (
    <MoneyLine
      label={
        <>
          {label}
          <span className="ml-1.5 text-muted-foreground">
            {total.loads} {total.loads === 1 ? "load" : "loads"}
          </span>
        </>
      }
    >
      {formatRate(total.pay)}
    </MoneyLine>
  )
}

/**
 * The right-hand side of the driver page: the one thing to do about them
 * now, whether their paperwork is current, and what they've earned.
 */
export function DriverSidePanel({
  organizationId,
  driver,
  items,
  loads,
  manager,
  loadsBase,
  today,
}: {
  organizationId: string
  driver: Driver
  items: ComplianceItem[]
  loads: DriverLoad[]
  manager: boolean
  /** /org/<slug>/loads */
  loadsBase: string
  /** "YYYY-MM-DD" */
  today: string
}) {
  const step = driverNextStep(driver, items, loads)
  const action = step.action
  // Inactive drivers aren't driving, so their dates don't need warnings.
  const warn = driver.status === "active"
  const current = items.every((item) => item.expiry.state === "ok")
  const photos = [
    { label: "CDL photo", path: driver.cdl_photo_path },
    { label: "Medical card photo", path: driver.medical_card_photo_path },
  ]

  const earnings = driverEarnings(loads, today)
  const rate = formatPay(driver.pay_type, driver.pay_rate)
  const unpriced = earnings.all.unpriced + earnings.ahead.unpriced
  const year = earnings.year

  return (
    <div className="flex flex-col gap-4">
      {/* Needs attention */}
      <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
        <div className="px-5 pt-4 pb-5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Needs attention
          </p>
          <h4 className="mt-1 text-lg font-semibold tracking-tight">
            {step.title}
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">{step.detail}</p>
          {action?.type === "load" && (
            <Link
              href={`${loadsBase}/${action.id}`}
              className={buttonVariants({
                size: "lg",
                className: "mt-4 w-full",
              })}
            >
              Open load {action.reference} <ArrowRight />
            </Link>
          )}
          {action?.type === "new_load" && manager && (
            <Link
              href={`${loadsBase}/new`}
              className={buttonVariants({
                size: "lg",
                className: "mt-4 w-full",
              })}
            >
              <Plus /> New load
            </Link>
          )}
          {action?.type === "edit" && manager && (
            <a
              href={`#${DRIVER_DATES_ID}`}
              className={buttonVariants({
                size: "lg",
                className: "mt-4 w-full",
              })}
            >
              <CalendarClock /> {action.label}
            </a>
          )}
          {action?.type === "activate" && manager && (
            <div className="mt-4">
              <DriverStatusButton
                organizationId={organizationId}
                driver={{
                  id: driver.id,
                  full_name: driver.full_name,
                  status: driver.status,
                }}
              />
            </div>
          )}
        </div>
      </section>

      {/* Compliance */}
      <Panel
        title="Compliance"
        aside={
          warn &&
          current && (
            <span className="inline-flex h-6 items-center rounded-4xl bg-emerald-500/15 px-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              All current
            </span>
          )
        }
      >
        <ul className="flex flex-col divide-y">
          {items.map((item) => (
            <li key={item.key} className="py-2.5 first:pt-0">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <ItemIcon item={item} warn={warn} />
                  <span
                    className={cn(
                      "truncate font-medium",
                      !item.due && "text-muted-foreground"
                    )}
                  >
                    {item.label}
                  </span>
                </span>
                {!item.due ? (
                  <span className="text-xs text-muted-foreground">Not set</span>
                ) : warn && needsAction(item.expiry.state) ? (
                  <ExpiryBadge item={item} />
                ) : (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {item.kind === "expires" ? "Expires" : "Due"}{" "}
                    {formatDate(item.due)}
                  </span>
                )}
              </div>
              {item.kind === "due" && (
                <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
                  {item.last
                    ? `Last done ${formatDate(item.last)}`
                    : "Not done yet"}
                </p>
              )}
            </li>
          ))}
          {photos.map((photo) => (
            <li
              key={photo.label}
              className="flex items-center justify-between gap-3 py-2.5 text-sm last:pb-0"
            >
              <span className="flex items-center gap-2">
                {photo.path ? (
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    "font-medium",
                    !photo.path && "text-muted-foreground"
                  )}
                >
                  {photo.label}
                </span>
              </span>
              <a
                href={`#${DRIVER_DOCUMENTS_ID}`}
                className="text-xs font-medium hover:underline"
              >
                {photo.path ? "View" : manager ? "Upload" : "Not on file"}
              </a>
            </li>
          ))}
        </ul>
      </Panel>

      {/* Pay */}
      <Panel
        title="Pay"
        aside={
          <span className="text-sm text-muted-foreground">
            {rate ?? "No rate set"}
          </span>
        }
      >
        <dl className="flex flex-col gap-2">
          <PayRow label="This week" total={earnings.week} />
          <PayRow label="This month" total={earnings.month} />
          <PayRow label="This year" total={year} />
          <PayRow label="All time" total={earnings.all} />
          {earnings.ahead.loads > 0 && (
            <>
              <div className="my-1 border-t" />
              <MoneyLine
                label={
                  <>
                    Booked ahead
                    <span className="ml-1.5">
                      {earnings.ahead.loads}{" "}
                      {earnings.ahead.loads === 1 ? "load" : "loads"}
                    </span>
                  </>
                }
                muted
              >
                {formatRate(earnings.ahead.pay)}
              </MoneyLine>
            </>
          )}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          By delivery date, at the rate locked on each load.
          {unpriced > 0 &&
            ` ${unpriced} per-mile ${unpriced === 1 ? "load has" : "loads have"} no miles, so ${unpriced === 1 ? "it isn't" : "they aren't"} counted.`}
        </p>
        {year.loads > 0 && (
          <p className="mt-2 text-sm text-muted-foreground tabular-nums">
            This year: {miles.format(year.miles)} mi ·{" "}
            {formatRate(year.revenue)} revenue
            {year.miles > 0 &&
              ` · ${formatRate(year.revenue / year.miles)} per mile`}
          </p>
        )}
      </Panel>
    </div>
  )
}
