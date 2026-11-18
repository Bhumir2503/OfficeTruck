/*
 * Wording and schedules for DQ files: status labels, the statements people
 * sign, and when reminders go out. Pure, so the reminder rules can be tested.
 *
 * The word is "Audit-ready", never "compliant": OfficeTruck organizes the
 * records, it doesn't certify that a carrier meets federal rules.
 */

import type { DqItemStatus } from "@/lib/dq-rules"

// A local copy of dq-rules' addDays: tests load this file directly, where
// only type imports (erased) can use the @/ path.
function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

export const DQ_STATUS_LABELS: Record<DqItemStatus, string> = {
  missing: "Missing",
  pending_review: "Pending review",
  complete: "Complete",
  due_soon: "Due soon",
  upcoming: "Upcoming",
  overdue: "Overdue",
  not_applicable: "Not applicable",
}

export const AUDIT_READY = "Audit-ready"

/** On every export page, per the spec. */
export const EXPORT_DISCLAIMER =
  "OfficeTruck organizes these records. It does not certify that a carrier meets federal rules."

// ------------------------------------------------------------ Statements --

/** 391.21(b)(12)'s certification, signed by the driver. */
export function applicationStatement(): string {
  return "This certifies that this application was completed by me, and that all entries on it and information in it are true and complete to the best of my knowledge."
}

export function annualReviewStatement(input: {
  driverName: string
  mvrDate: string | null
}): string {
  const record = input.mvrDate
    ? `the driving record dated ${input.mvrDate}`
    : "the driving record on file"
  return `I reviewed ${record} for ${input.driverName} to decide whether they meet the minimum requirements for safe driving or are disqualified (49 CFR 391.25).`
}

export function registryStatement(input: {
  driverName: string
  examinerName: string
  registryNumber: string
  verifiedOn: string
}): string {
  return `On ${input.verifiedOn} I verified that ${input.examinerName}, registry number ${input.registryNumber}, who examined ${input.driverName}, is listed on the FMCSA National Registry of Certified Medical Examiners (49 CFR 391.23(m)).`
}

// ------------------------------------------------------------- Reminders --

/** Days before the date that a reminder goes out. */
export const REMINDER_DAYS = [60, 30, 14, 7] as const

export type Reminder = { key: string; date: string }

const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000
  )

/**
 * The reminder to send today for something due on `due`, if any: 60, 30, 14
 * and 7 days before, then the day after it's due and weekly from there. Each
 * has a key, so the job records it and never sends it twice. A reminder the
 * job missed (it didn't run that day) is still sent the next day, as long as
 * the next one isn't due yet.
 */
export function reminderFor(due: string, today: string): Reminder | null {
  const until = daysBetween(today, due)
  if (until >= 0) {
    // The nearest threshold at or above `until`.
    const days = [...REMINDER_DAYS].reverse().find((d) => until <= d)
    if (days === undefined) return null
    return { key: `d${days}`, date: addDays(due, -days) }
  }
  const weeksLate = Math.floor((-until - 1) / 7)
  return { key: `overdue_${weeksLate}`, date: addDays(due, 1 + weeksLate * 7) }
}

/** When a completed item stops counting, or when an open one is due. */
export function reminderDate(item: {
  completed_at: string | null
  valid_until: string | null
  due_date: string | null
  not_applicable_reason: string | null
}): string | null {
  if (item.not_applicable_reason) return null
  return item.completed_at ? item.valid_until : item.due_date
}
