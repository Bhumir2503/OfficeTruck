import { ArrowRight } from "lucide-react"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import {
  type ComplianceItem,
  formatDate,
  needsAction,
} from "@/lib/driver-format"
import { formatTaxYear } from "@/lib/truck-format"
import type { TruckStatus } from "@/lib/schemas/truck"

/** The Plate and compliance card on the truck page, where its dates are edited. */
export const TRUCK_DATES_ID = "dates"

type Tax = ComplianceItem & { covered: boolean; taxYear: number }

const plural = (count: number, word: string) =>
  `${count} ${count === 1 ? word : `${word}s`}`

/** Most pressing first: overdue (longest ago), missing, then soonest due. */
function rank(item: ComplianceItem) {
  const { expiry } = item
  if (expiry.state === "expired") return -1_000_000 - expiry.days
  if (expiry.state === "missing") return -1
  return expiry.days
}

function wording(item: ComplianceItem, taxYear: number) {
  const { expiry, label, kind } = item
  const name =
    item.key === "form_2290" ? `2290 for ${formatTaxYear(taxYear)}` : label
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
  items,
  tax,
  manager,
  complianceHref,
}: {
  status: TruckStatus
  items: ComplianceItem[]
  tax: Tax
  manager: boolean
  /** /org/<slug>/compliance, where 2290s are filed. */
  complianceHref: string
}) {
  const all = tax.covered ? items : [...items, tax]
  const pressing = all
    .filter(
      (item) =>
        item.expiry.state === "missing" || needsAction(item.expiry.state)
    )
    .sort((a, b) => rank(a) - rank(b))

  let title: string
  let detail: string
  let action: { href: string; label: string } | null = null

  if (status !== "active") {
    title = status === "out_of_service" ? "Out of service" : "Inactive"
    detail =
      "Its dates aren't tracked while it's off the road. Set it back to active to get warnings again."
  } else if (pressing.length) {
    const next = pressing[0]!
    ;({ title, detail } = wording(next, tax.taxYear))
    if (next.key === "form_2290") {
      detail = `Not on the ${formatTaxYear(tax.taxYear)} return. ${detail}`
      action = { href: complianceHref, label: "Open Compliance" }
    } else if (manager) {
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
    detail = upcoming
      ? `Next up: ${upcoming.key === "form_2290" ? "2290" : upcoming.label.toLowerCase()} on ${formatDate(upcoming.due!)}.`
      : "Nothing is due."
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
      <div className="px-5 pt-4 pb-5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Next action
        </p>
        <h4 className="mt-1 text-lg font-semibold tracking-tight">{title}</h4>
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
