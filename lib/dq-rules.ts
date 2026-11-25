/*
 * The DQ file rules engine: which items a driver needs, the status of each,
 * and what comes next when one is completed. Pure: no database, no clock.
 * Today's date is always passed in, and every rule comes from the
 * dq_requirement_templates rows. See docs/dq-file-spec.md.
 *
 * Dates are "YYYY-MM-DD" strings, worked in UTC so the result doesn't
 * depend on the server's time zone.
 */

// ---------------------------------------------------------------- Types --

export type DqFileType = "dq" | "investigation" | "drug_alcohol"
export type LicenseClass = "cdl" | "clp" | "non_cdl"

/** A row of dq_requirement_templates. */
export type DqTemplate = {
  id: string
  code: string
  title: string
  cfr_ref: string
  file_type: DqFileType
  applies_to: "all" | "cdl" | "non_cdl" | "conditional"
  due_rule:
    | "before_first_trip"
    | "days_after_start"
    | "months_after_start"
    | "with_paired"
    | "hours_after_trigger"
  due_offset_days: number | null
  due_offset_hours: number | null
  recurrence_months: number | null
  max_validity_months: number | null
  per_state: boolean
  paired_code: string | null
  follows_paired: boolean
  applies_when: "holds_medical_variance" | null
  trigger_code: string | null
  trigger_result: "record_found" | null
  evidence: "document" | "attestation" | "either" | "contact_log"
  retention_rule: "employment_plus_years" | "from_item_years" | "no_auto_delete"
  retention_years: number | null
  sort_order: number
  /** "-infinity", or the first day the rule applies. */
  effective_from: string
  /** "infinity", or the first day it no longer applies. */
  effective_to: string
}

/** The driver facts the checklist is built from. */
export type DqDriver = {
  license_class: LicenseClass | null
  /** The current license state (drivers.cdl_state). */
  license_state: string | null
  prior_license_states: readonly string[]
  start_date: string | null
  end_date: string | null
  holds_medical_variance: boolean
}

/** An item to create: what buildChecklist and nextCycle return. */
export type PlannedItem = {
  template_id: string
  template_code: string
  file_type: DqFileType
  license_state: string | null
  cycle_number: number
  due_date: string | null
}

/** A dq_items row, with what's needed to work out its status. */
export type DqItem = {
  template_code: string
  license_state: string | null
  cycle_number: number
  due_date: string | null
  /** ISO timestamp. */
  completed_at: string | null
  valid_until: string | null
  not_applicable_reason: string | null
  /** An upload or signature is waiting for an owner or admin to confirm. */
  pending_review?: boolean
}

export const DQ_ITEM_STATUSES = [
  "missing",
  "pending_review",
  "complete",
  "due_soon",
  "upcoming",
  "overdue",
  "not_applicable",
] as const
export type DqItemStatus = (typeof DQ_ITEM_STATUSES)[number]

/** How close a date has to be to count as due soon. */
export const DUE_SOON_DAYS = 30

// ---------------------------------------------------------------- Dates --

const DATE = /^\d{4}-\d{2}-\d{2}$/

function parse(date: string): Date {
  if (!DATE.test(date)) {
    throw new Error(`Expected a YYYY-MM-DD date, got "${date}".`)
  }
  return new Date(`${date}T00:00:00Z`)
}

const format = (date: Date) => date.toISOString().slice(0, 10)

export function addDays(date: string, days: number): string {
  const result = parse(date)
  result.setUTCDate(result.getUTCDate() + days)
  return format(result)
}

/** Adds months, keeping to the end of shorter months: Jan 31 + 1 → Feb 28. */
export function addMonths(date: string, months: number): string {
  const start = parse(date)
  const day = start.getUTCDate()
  const result = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1)
  )
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return format(result)
}

/** The UTC date of an ISO timestamp, or a date as is. */
export function dateOf(value: string): string {
  return DATE.test(value) ? value : new Date(value).toISOString().slice(0, 10)
}

const earliest = (dates: readonly (string | null)[]) =>
  dates.reduce<string | null>(
    (min, date) => (date !== null && (min === null || date < min) ? date : min),
    null
  )

// ------------------------------------------------------------ Templates --

/** Whether a rule is in force on a date. Both ends come as strings. */
export function inEffect(template: DqTemplate, date: string): boolean {
  const from = template.effective_from
  const to = template.effective_to
  return (
    (from === "-infinity" || from <= date) && (to === "infinity" || date < to)
  )
}

/** The version of each rule in force on a date, in checklist order. */
export function rulesOn(
  templates: readonly DqTemplate[],
  date: string
): DqTemplate[] {
  return templates
    .filter((template) => inEffect(template, date))
    .sort((a, b) => a.sort_order - b.sort_order)
}

// Every driver is treated as a CDL holder unless they're explicitly marked
// non-CDL. Setup no longer asks for the class, so most drivers have none
// saved; the non-CDL rules stay in the data for later.
const isCdl = (driver: DqDriver) => driver.license_class !== "non_cdl"

/** Whether a rule applies to a driver from the start (not by a trigger). */
export function appliesTo(template: DqTemplate, driver: DqDriver): boolean {
  switch (template.applies_to) {
    case "all":
      return true
    case "cdl":
      return isCdl(driver)
    case "non_cdl":
      return driver.license_class === "non_cdl"
    case "conditional":
      return (
        template.trigger_code === null &&
        template.applies_when === "holds_medical_variance" &&
        driver.holds_medical_variance
      )
  }
}

/** The facts still needed before the checklist is complete. */
export function missingDriverFacts(
  driver: DqDriver
): ("license_state" | "start_date")[] {
  const missing: ("license_state" | "start_date")[] = []
  if (!driver.license_state) missing.push("license_state")
  if (!driver.start_date) missing.push("start_date")
  return missing
}

/** The states that licensed the driver in the past 3 years, current first. */
export function licenseStates(driver: DqDriver): string[] {
  return [
    ...new Set(
      [driver.license_state, ...driver.prior_license_states].filter(
        (state): state is string => !!state
      )
    ),
  ]
}

// ------------------------------------------------------------ Checklist --

function firstDueDate(template: DqTemplate, driver: DqDriver): string | null {
  const start = driver.start_date
  if (!start) return null
  switch (template.due_rule) {
    case "before_first_trip":
      return start
    case "days_after_start":
      return addDays(start, template.due_offset_days ?? 0)
    case "months_after_start":
      return addMonths(start, template.recurrence_months ?? 12)
    case "with_paired":
    case "hours_after_trigger":
      return null
  }
}

/** Whether an item would be due after the driver left: those aren't made. */
const afterLeaving = (driver: DqDriver, due: string | null) =>
  driver.end_date !== null && due !== null && due > driver.end_date

/**
 * The first cycle of every item that applies to this driver under today's
 * rules: 6a for CDL and CLP holders or 6b and the registry note for non-CDL
 * drivers, one hire MVR per state, the drug and alcohol file only for CDL
 * holders. Items that would fall due after the driver's end date are left
 * out. A driver with no license class saved is treated as a CDL holder.
 */
export function buildChecklist(
  driver: DqDriver,
  templates: readonly DqTemplate[],
  today: string
): PlannedItem[] {
  const rules = rulesOn(templates, today).filter((rule) =>
    appliesTo(rule, driver)
  )
  const states = licenseStates(driver)

  const items: PlannedItem[] = []
  for (const rule of rules) {
    const due = firstDueDate(rule, driver)
    const forStates = rule.per_state && states.length ? states : [null]
    for (const state of forStates) {
      items.push({
        template_id: rule.id,
        template_code: rule.code,
        file_type: rule.file_type,
        license_state: rule.per_state ? state : null,
        cycle_number: 1,
        due_date: due,
      })
    }
  }

  // Paired items are due with the item they go with.
  for (const item of items) {
    const rule = rules.find((r) => r.id === item.template_id)
    if (rule?.due_rule === "with_paired") {
      item.due_date =
        items.find((other) => other.template_code === rule.paired_code)
          ?.due_date ?? null
    }
  }

  return items.filter((item) => !afterLeaving(driver, item.due_date))
}

// --------------------------------------------------------------- Status --

/**
 * An item's status, worked out from its dates. Never stored.
 *
 *   not_applicable  marked so, with a reason
 *   complete        done, and valid for more than 30 days
 *   due_soon        done but runs out within 30 days, or not done and due
 *                   within 30 days (counts as Audit-ready)
 *   upcoming        not done, not due for more than 30 days (counts as
 *                   Audit-ready)
 *   pending_review  an upload waits for confirmation (shown ahead of overdue,
 *                   since confirming is what's needed)
 *   overdue         past its due date, or done but expired
 *   missing         required now (due today, or no due date yet) and nothing
 *                   on file
 */
export function itemStatus(item: DqItem, today: string): DqItemStatus {
  if (item.not_applicable_reason) return "not_applicable"
  const soon = addDays(today, DUE_SOON_DAYS)

  if (item.completed_at) {
    if (item.valid_until === null) return "complete"
    if (item.valid_until < today) return "overdue"
    return item.valid_until <= soon ? "due_soon" : "complete"
  }

  if (item.pending_review) return "pending_review"
  if (item.due_date === null || item.due_date === today) return "missing"
  if (item.due_date < today) return "overdue"
  return item.due_date <= soon ? "due_soon" : "upcoming"
}

const itemKey = (item: Pick<DqItem, "template_code" | "license_state">) =>
  `${item.template_code}:${item.license_state ?? ""}`

/**
 * The latest cycle of each requirement, plus any earlier cycle still open.
 * Done (or not applicable) earlier cycles are history: an annual MVR from
 * two years ago has long expired, but the newer one is what counts. An
 * earlier one never done still counts, though: completing year 1's annual
 * MVR adds year 2's review while year 1's may not be signed yet.
 */
export function currentItems<T extends DqItem>(items: readonly T[]): T[] {
  const latest = new Map<string, T>()
  for (const item of items) {
    const key = itemKey(item)
    const seen = latest.get(key)
    if (!seen || item.cycle_number > seen.cycle_number) {
      latest.set(key, item)
    }
  }
  const newest = new Set(latest.values())
  return items.filter(
    (item) =>
      newest.has(item) || (!item.completed_at && !item.not_applicable_reason)
  )
}

export type DqDriverStatus =
  | { status: "audit_ready"; nextDueDate: string | null }
  | {
      status: "not_audit_ready"
      missing: number
      overdue: number
      pendingReview: number
      nextDueDate: string | null
    }
  | { status: "no_checklist" }

const READY: readonly DqItemStatus[] = [
  "complete",
  "due_soon",
  "upcoming",
  "not_applicable",
]

/**
 * Audit-ready when the latest cycle of every item is Complete, Due soon,
 * Upcoming or Not applicable; otherwise the counts of what's missing,
 * overdue and waiting for review. Pass the items of the file being judged
 * (usually the standard DQ file). nextDueDate is the earliest date anything
 * is needed by: a due date, or when a completed item runs out.
 */
export function driverStatus(
  items: readonly DqItem[],
  today: string
): DqDriverStatus {
  const current = currentItems(items)
  const statuses = current.map((item) => itemStatus(item, today))
  const nextDueDate = earliest(
    current
      .filter((item) => !item.not_applicable_reason)
      .map((item) => (item.completed_at ? item.valid_until : item.due_date))
  )

  // No checklist yet (the driver's facts aren't set) is never Audit-ready.
  if (!current.length) {
    return { status: "no_checklist" }
  }
  if (statuses.every((status) => READY.includes(status))) {
    return { status: "audit_ready", nextDueDate }
  }
  const count = (status: DqItemStatus) =>
    statuses.filter((s) => s === status).length
  return {
    status: "not_audit_ready",
    missing: count("missing"),
    overdue: count("overdue"),
    pendingReview: count("pending_review"),
    nextDueDate,
  }
}

// ----------------------------------------------------------- Completion --

/** Whether completing an item needs the expiry date printed on it. */
export const needsExpiryDate = (template: DqTemplate) =>
  template.max_validity_months !== null

/**
 * How long a completed item counts. `done` is the date it was done (the
 * document's confirmed issue date, or the day it was completed); `expires`
 * the confirmed expiry date on the document. Medical proof runs to its own
 * expiry date, never assumed to be 24 months, but never longer than 24.
 * Returns null when it doesn't run out, and throws if a needed expiry date
 * is missing.
 */
export function validUntil(
  template: DqTemplate,
  done: string,
  expires: string | null
): string | null {
  if (template.max_validity_months !== null) {
    if (!expires) {
      throw new Error(`${template.title} needs its expiry date.`)
    }
    const longest = addMonths(done, template.max_validity_months)
    return expires < longest ? expires : longest
  }
  if (template.recurrence_months !== null) {
    return addMonths(done, template.recurrence_months)
  }
  return null
}

/** A completed item, with the confirmed facts its follow-ups depend on. */
export type CompletedItem = DqItem & {
  template_id: string
  completed_at: string
  /** The confirmed date it was done: the MVR's date, the query date. */
  done_on: string | null
  /** The confirmed result, for Clearinghouse queries. */
  query_result?: "no_record" | "record_found" | null
}

/**
 * The items to create when one is completed:
 *   * its next cycle, if it recurs: due 12 months from the date it was done
 *     (annual MVR, limited query), or when it expires (medical proof);
 *   * the next cycle of items that follow it (the annual review with the
 *     annual MVR, the registry note with the medical certificate);
 *   * items its result triggers (a limited query that found a record needs a
 *     full query within 24 hours).
 * Nothing is created that would fall due after the driver's end date.
 */
export function nextCycle(
  item: CompletedItem,
  templates: readonly DqTemplate[],
  driver: DqDriver
): PlannedItem[] {
  const rule = templates.find((t) => t.id === item.template_id)
  if (!rule) {
    throw new Error(`No rule ${item.template_id} for ${item.template_code}.`)
  }
  const done = item.done_on ?? dateOf(item.completed_at)
  const today = dateOf(item.completed_at)
  const rules = rulesOn(templates, today)
  const next: PlannedItem[] = []

  const nextDue =
    rule.max_validity_months !== null
      ? item.valid_until
      : rule.recurrence_months !== null && !rule.follows_paired
        ? addMonths(done, rule.recurrence_months)
        : null

  if (nextDue !== null) {
    // The current version of the rule, in case it changed since.
    const current = rules.find((r) => r.code === rule.code) ?? rule
    if (appliesTo(current, driver) || current.applies_to === "conditional") {
      next.push({
        template_id: current.id,
        template_code: current.code,
        file_type: current.file_type,
        license_state: item.license_state,
        cycle_number: item.cycle_number + 1,
        due_date: nextDue,
      })
    }
    for (const follower of rules.filter(
      (r) => r.follows_paired && r.paired_code === rule.code
    )) {
      if (!appliesTo(follower, driver)) continue
      next.push({
        template_id: follower.id,
        template_code: follower.code,
        file_type: follower.file_type,
        license_state: null,
        cycle_number: item.cycle_number + 1,
        due_date: nextDue,
      })
    }
  }

  for (const triggered of rules.filter(
    (r) =>
      r.trigger_code === rule.code &&
      r.trigger_result !== null &&
      r.trigger_result === item.query_result
  )) {
    const due = new Date(item.completed_at)
    due.setUTCHours(due.getUTCHours() + (triggered.due_offset_hours ?? 24))
    next.push({
      template_id: triggered.id,
      template_code: triggered.code,
      file_type: triggered.file_type,
      license_state: null,
      cycle_number: item.cycle_number,
      due_date: format(due),
    })
  }

  return next.filter((planned) => !afterLeaving(driver, planned.due_date))
}

// ------------------------------------------------------------ Retention --

/**
 * The first day an item may be removed, or null if it's kept until the
 * owner decides (or the driver hasn't left yet, for employment-based rules).
 * Nothing is deleted automatically; past this date it's only flagged.
 */
export function retentionUntil(
  template: DqTemplate,
  itemDate: string | null,
  driver: DqDriver
): string | null {
  const years = template.retention_years
  if (template.retention_rule === "no_auto_delete" || years === null) {
    return null
  }
  if (template.retention_rule === "employment_plus_years") {
    return driver.end_date ? addMonths(driver.end_date, years * 12) : null
  }
  return itemDate ? addMonths(itemDate, years * 12) : null
}
