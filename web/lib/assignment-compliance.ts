import { formatDate, type ComplianceItem } from "@/lib/driver-format"

/**
 * A driver's or truck's date to keep up with, as the assignment pickers get
 * it: the CDL, medical card, annual review and Clearinghouse query for a
 * driver; the annual inspection, registration and plate for a truck.
 */
export type AssignmentDate = {
  label: string
  /** "expires" for documents that run out, "due" for checks to redo. */
  kind: "expires" | "due"
  /** The last day it's good for, "YYYY-MM-DD". */
  due: string
  /** Already past, as of today on the server. */
  expired: boolean
}

/** The dates the pickers need from a record's compliance items. */
export function assignmentDates(items: ComplianceItem[]): AssignmentDate[] {
  return items.flatMap((item) =>
    item.due
      ? [
          {
            label: item.label,
            kind: item.kind,
            due: item.due,
            expired: item.expiry.state === "expired",
          },
        ]
      : []
  )
}

/**
 * What stops a driver or truck from legally running a load: dates already
 * past, and dates that run out before `until`, the load's last day (a date
 * is good through its own day). Most pressing first.
 */
export function assignmentProblems(
  dates: readonly AssignmentDate[],
  until: string | null
): AssignmentDate[] {
  return dates
    .filter((date) => date.expired || (until !== null && date.due < until))
    .sort((a, b) => a.due.localeCompare(b.due))
}

function lower(label: string) {
  // "CDL" stays as it is; "Medical card" reads "medical card" mid-sentence.
  return label === label.toUpperCase() ? label : label.toLowerCase()
}

/** "Medical card expired Nov 3, 2026", for a picker's line. */
export function problemShort(problem: AssignmentDate) {
  const on = formatDate(problem.due)
  if (problem.expired) {
    return problem.kind === "due"
      ? `${problem.label} overdue since ${on}`
      : `${problem.label} expired ${on}`
  }
  return problem.kind === "due"
    ? `${problem.label} due ${on}, before delivery`
    : `${problem.label} expires ${on}, before delivery`
}

/**
 * "Beth Calloway's medical card expired Nov 3, 2026." or "Truck T-102's
 * registration expires Dec 1, 2026, before this load delivers."
 */
export function problemSentence(owner: string, problem: AssignmentDate) {
  const on = formatDate(problem.due)
  const what = `${owner}'s ${lower(problem.label)}`
  if (problem.expired) {
    return problem.kind === "due"
      ? `${what} was due ${on}.`
      : `${what} expired ${on}.`
  }
  return problem.kind === "due"
    ? `${what} is due ${on}, before this load delivers.`
    : `${what} expires ${on}, before this load delivers.`
}

/** The load's last day, "YYYY-MM-DD", from its delivery appointment. */
export function loadUntil(load: {
  delivery_start: string | null
  delivery_end?: string | null
}) {
  const last = load.delivery_end ?? load.delivery_start
  return last ? last.slice(0, 10) : null
}
