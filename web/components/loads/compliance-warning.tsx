import { TriangleAlert } from "lucide-react"
import Link from "next/link"

import {
  assignmentProblems,
  missingSentence,
  problemSentence,
} from "@/lib/assignment-compliance"
import type { DriverOption } from "@/lib/drivers"
import type { TruckOption } from "@/lib/trucks"

/**
 * Warns when the picked driver or truck can't legally run the load: a CDL,
 * medical card, inspection or registration already past, or running out
 * before `until`, the load's last day. A driver with no CDL expiration or
 * medical card on file gets a softer note: nothing says they're out of
 * date, and nothing says they aren't. Nothing when all is in order.
 */
export function ComplianceWarning({
  driver,
  truck,
  until,
  driversBase,
  trucksBase,
}: {
  driver: DriverOption | null | undefined
  truck: TruckOption | null | undefined
  until: string | null
  /** /org/<slug>/drivers and /org/<slug>/equipment, to fix the dates. */
  driversBase: string
  trucksBase: string
}) {
  const rows = [
    ...(driver
      ? assignmentProblems(driver.compliance, until).map((problem) => ({
          key: `driver-${problem.label}`,
          text: problemSentence(driver.full_name, problem),
          href: `${driversBase}/${driver.id}`,
        }))
      : []),
    ...(truck
      ? assignmentProblems(truck.compliance, until).map((problem) => ({
          key: `truck-${problem.label}`,
          text: problemSentence(`Truck ${truck.unit_number}`, problem),
          href: `${trucksBase}/${truck.id}`,
        }))
      : []),
  ]
  const missing =
    driver && driver.missing.length > 0
      ? {
          text: missingSentence(driver.full_name, driver.missing),
          href: `${driversBase}/${driver.id}`,
        }
      : null
  if (!rows.length && !missing) return null

  if (!rows.length && missing) {
    return (
      <div
        role="status"
        className="flex gap-2.5 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          {missing.text}{" "}
          <Link
            href={missing.href}
            className="font-medium underline underline-offset-2"
          >
            Add them
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div
      role="alert"
      className="flex gap-2.5 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.key}>
            {row.text}{" "}
            <Link
              href={row.href}
              className="font-medium underline underline-offset-2"
            >
              Update it
            </Link>
          </li>
        ))}
        {missing && (
          <li>
            {missing.text}{" "}
            <Link
              href={missing.href}
              className="font-medium underline underline-offset-2"
            >
              Add them
            </Link>
          </li>
        )}
      </ul>
    </div>
  )
}
