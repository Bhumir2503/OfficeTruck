import { cn } from "cn"
import { ArrowRight, CircleCheck } from "lucide-react"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import {
  type ComplianceItem,
  formatDate,
  needsAction,
} from "@/lib/driver-format"
import type { PmStatus } from "@/lib/truck-format"
import type { TruckStatus } from "@/lib/schemas/truck"

/** The Plate and compliance card on the truck page, where its dates are edited. */
export const TRUCK_DATES_ID = "dates"
/** The Maintenance card on the truck page. */
export const TRUCK_MAINTENANCE_ID = "maintenance"

const miles = new Intl.NumberFormat("en-US")

const plural = (count: number, word: string) =>
  `${count} ${count === 1 ? word : `${word}s`}`

/** Most pressing first: overdue (longest ago), missing, then soonest due. */
function rank(item: ComplianceItem) {
  const { expiry } = item
  if (expiry.state === "expired") return -1_000_000 - expiry.days
  if (expiry.state === "missing") return -1
  return expiry.days
}

function wording(item: ComplianceItem) {
  const { expiry, label, kind } = item
  const name = label
  if (expiry.state === "missing") {
    return {
      title: `Add the ${label.toLowerCase()} date`,
      detail: "Nothing is on file yet, so it can't be tracked.",
    }
  }
  const on = formatDate(item.due!)
  if (expiry.state === "expired") {
    return {
      title: `${name} ${kind === "expires" ? "expired" : "overdue"}`,
      detail: `${expiry.days === 0 ? "Today" : `${plural(expiry.days, "day")} ago`}, on ${on}.`,
    }
  }
  return {
    title: `${name} ${kind === "expires" ? "expires" : "due"} ${
      expiry.days === 0 ? "today" : `in ${plural(expiry.days, "day")}`
    }`,
    detail: `On ${on}.`,
  }
}

/**
 * The one thing to do next for a truck's compliance, like the driver
 * page's Next action: the most pressing date, with a way to deal with it.
 */
export function TruckNextAction({
  status,
  outOfService,
  items,
  pm,
  manager,
  today,
}: {
  status: TruckStatus
  /** Why it's out of service and when it's expected back. */
  outOfService: { reason: string | null; until: string | null }
  items: ComplianceItem[]
  pm: PmStatus
  manager: boolean
  /** "YYYY-MM-DD" */
  today: string
}) {
  const all = items
  const pressing = all
    .filter(
      (item) =>
        item.expiry.state === "missing" || needsAction(item.expiry.state)
    )
    .sort((a, b) => rank(a) - rank(b))

  let title: string
  let detail: string
  let action: { href: string; label: string } | null = null
  let allCurrent = false

  // Anything overdue on paper comes before maintenance; maintenance that's
  // overdue comes before paperwork that's merely coming up.
  const overduePaper = pressing.some((item) => item.expiry.state === "expired")
  const pmFirst =
    pm.state === "due" ? !overduePaper : pm.state === "soon" && !pressing.length

  if (status !== "active") {
    title = status === "out_of_service" ? "Out of service" : "Inactive"
    if (
      status === "out_of_service" &&
      (outOfService.reason || outOfService.until)
    ) {
      const until = outOfService.until
      detail = [
        outOfService.reason,
        until &&
          (until < today
            ? `Was due back ${formatDate(until)}.`
            : `Back by ${formatDate(until)}.`),
      ]
        .filter(Boolean)
        .map((part) => (part!.endsWith(".") ? part : `${part}.`))
        .join(" ")
    } else {
      detail =
        "Its dates aren't tracked while it's off the road. Set it back to active to get warnings again."
    }
  } else if (pmFirst) {
    title =
      pm.state === "due"
        ? "Preventive maintenance overdue"
        : "Service coming up"
    detail = [
      pm.dueOn && `By ${formatDate(pm.dueOn)}`,
      pm.dueAtMiles !== null && `at ${miles.format(pm.dueAtMiles)} mi`,
    ]
      .filter(Boolean)
      .join(" or ")
    // "At 395,000 mi." when only a mileage interval is set.
    detail = detail
      ? `${detail.charAt(0).toUpperCase()}${detail.slice(1)}.`
      : ""
    if (pm.milesLeft !== null) {
      detail += ` ${pm.milesLeft <= 0 ? `${miles.format(-pm.milesLeft)} mi over` : `${miles.format(pm.milesLeft)} mi to go`} on the last reading.`
    }
    if (manager) {
      action = { href: `#${TRUCK_MAINTENANCE_ID}`, label: "Log maintenance" }
    }
  } else if (pressing.length) {
    const next = pressing[0]!
    ;({ title, detail } = wording(next))
    if (manager) {
      action = { href: `#${TRUCK_DATES_ID}`, label: "Update dates" }
    }
    if (pressing.length > 1) {
      detail += ` ${plural(pressing.length - 1, "more item")} after this.`
    }
  } else {
    const upcoming = all
      .filter((item) => item.due)
      .sort((a, b) => a.due!.localeCompare(b.due!))[0]
    title = "All current"
    allCurrent = true
    detail = upcoming
      ? `Next up: ${upcoming.label.toLowerCase()} on ${formatDate(upcoming.due!)}.`
      : "Nothing is due."
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
      <div className="px-5 pt-4 pb-5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Next action
        </p>
        <h4
          className={cn(
            "mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight",
            allCurrent && "text-emerald-700 dark:text-emerald-300"
          )}
        >
          {allCurrent && (
            <CircleCheck className="size-5 shrink-0" aria-hidden />
          )}
          {title}
        </h4>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        {action && (
          <Link
            href={action.href}
            className={buttonVariants({ size: "lg", className: "mt-4 w-full" })}
          >
            {action.label} <ArrowRight />
          </Link>
        )}
      </div>
    </section>
  )
}
