import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { reminderDate, reminderFor } from "@/lib/dq-format"
import {
  buildChecklist,
  currentItems,
  type DqDriver,
  type DqTemplate,
} from "@/lib/dq-rules"
import { loadTemplates } from "@/lib/dq/service"
import {
  sendDqReminderEmail,
  type DqReminderLine,
} from "@/lib/email/dq-reminder-email"

/*
 * The daily DQ job. Runs with the secret key (no one is signed in), so it
 * checks everything itself:
 *
 *   1. Adds the checklist items each current driver doesn't have yet (a new
 *      driver, a new license state, a rule that changed). Those items, with
 *      their due dates, are the tasks the compliance calendar shows.
 *   2. Emails each organization's owner one digest of what's coming due:
 *      60, 30, 14 and 7 days ahead, then weekly once overdue. Each reminder
 *      is recorded in dq_reminders so it's never sent twice.
 *
 * Every item it adds goes through the same triggers as any other write, so
 * it's in dq_audit_log too (with no actor).
 */

type DriverRow = {
  id: string
  organization_id: string
  full_name: string
  license_class: DqDriver["license_class"]
  cdl_state: string | null
  prior_license_states: string[]
  start_date: string | null
  end_date: string | null
  holds_medical_variance: boolean
}

type ItemRow = {
  id: string
  organization_id: string
  driver_id: string
  template_id: string
  template_code: string
  license_state: string | null
  cycle_number: number
  due_date: string | null
  completed_at: string | null
  valid_until: string | null
  not_applicable_reason: string | null
}

export type DqJobSummary = {
  drivers: number
  itemsAdded: number
  remindersSent: number
  emailErrors: string[]
}

const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000
  )

function describe(item: ItemRow, date: string, today: string) {
  const days = daysBetween(today, date)
  const pretty = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
  if (days < 0) {
    const late = -days
    return {
      when:
        late < 7
          ? `Overdue since ${pretty}`
          : `${Math.floor(late / 7)} week${late >= 14 ? "s" : ""} overdue`,
      overdue: true,
    }
  }
  return {
    when: `${item.completed_at ? "Expires" : "Due"} ${pretty}`,
    overdue: false,
  }
}

export async function runDqDailyJob(
  admin: SupabaseClient,
  today: string,
  appUrl: string
): Promise<DqJobSummary> {
  const templates: DqTemplate[] = await loadTemplates(admin)
  const titles = new Map(templates.map((t) => [t.id, t.title]))

  const { data: driverData, error: driverError } = await admin
    .from("drivers")
    .select(
      "id, organization_id, full_name, license_class, cdl_state, prior_license_states, start_date, end_date, holds_medical_variance"
    )
    .not("start_date", "is", null)
    .or(`end_date.is.null,end_date.gte.${today}`)
  if (driverError) throw new Error(driverError.message)
  const drivers = driverData as DriverRow[]
  const driverIds = drivers.map((d) => d.id)
  if (!driverIds.length) {
    return { drivers: 0, itemsAdded: 0, remindersSent: 0, emailErrors: [] }
  }

  // 1. Add the items each driver doesn't have yet.
  const loadItems = async () => {
    const { data, error } = await admin
      .from("dq_items")
      .select(
        "id, organization_id, driver_id, template_id, template_code, license_state, cycle_number, due_date, completed_at, valid_until, not_applicable_reason"
      )
      .in("driver_id", driverIds)
    if (error) throw new Error(error.message)
    return data as ItemRow[]
  }
  let items = await loadItems()
  const started = new Set(
    items.map(
      (i) => `${i.driver_id}:${i.template_code}:${i.license_state ?? ""}`
    )
  )
  const toAdd = drivers.flatMap((driver) =>
    buildChecklist(
      {
        license_class: driver.license_class,
        license_state: driver.cdl_state,
        prior_license_states: driver.prior_license_states,
        start_date: driver.start_date,
        end_date: driver.end_date,
        holds_medical_variance: driver.holds_medical_variance,
      },
      templates,
      today
    )
      .filter(
        (p) =>
          !started.has(
            `${driver.id}:${p.template_code}:${p.license_state ?? ""}`
          )
      )
      .map((p) => ({
        organization_id: driver.organization_id,
        driver_id: driver.id,
        template_id: p.template_id,
        license_state: p.license_state,
        cycle_number: p.cycle_number,
        due_date: p.due_date,
      }))
  )
  if (toAdd.length) {
    const { error } = await admin.from("dq_items").insert(toAdd)
    if (error) throw new Error(error.message)
    items = await loadItems()
  }

  // 2. Work out today's reminders.
  type Due = { item: ItemRow; key: string; date: string }
  const due: Due[] = []
  for (const driverId of driverIds) {
    const current = currentItems(items.filter((i) => i.driver_id === driverId))
    for (const item of current) {
      const date = reminderDate(item)
      if (!date) continue
      const reminder = reminderFor(date, today)
      if (reminder && reminder.date <= today) {
        due.push({ item, key: reminder.key, date })
      }
    }
  }
  if (!due.length) {
    return {
      drivers: drivers.length,
      itemsAdded: toAdd.length,
      remindersSent: 0,
      emailErrors: [],
    }
  }

  const { data: sentData } = await admin
    .from("dq_reminders")
    .select("dq_item_id, reminder, due_on")
    .in(
      "dq_item_id",
      due.map((d) => d.item.id)
    )
  const sent = new Set(
    (
      (sentData ?? []) as {
        dq_item_id: string
        reminder: string
        due_on: string
      }[]
    ).map((r) => `${r.dq_item_id}:${r.reminder}:${r.due_on}`)
  )
  const toSend = due.filter((d) => !sent.has(`${d.item.id}:${d.key}:${d.date}`))

  // 3. One email per organization, to its owner.
  const names = new Map(drivers.map((d) => [d.id, d.full_name]))
  const byOrg = new Map<string, Due[]>()
  for (const entry of toSend) {
    const list = byOrg.get(entry.item.organization_id) ?? []
    list.push(entry)
    byOrg.set(entry.item.organization_id, list)
  }

  let remindersSent = 0
  const emailErrors: string[] = []
  for (const [organizationId, entries] of byOrg) {
    const [{ data: org }, { data: owner }] = await Promise.all([
      admin
        .from("organizations")
        .select("name, slug")
        .eq("id", organizationId)
        .single(),
      admin
        .from("organization_users")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("role", "owner")
        .single(),
    ])
    const organization = org as { name: string; slug: string } | null
    const ownerId = (owner as { user_id: string } | null)?.user_id
    if (!organization || !ownerId) continue
    const { data: user } = await admin.auth.admin.getUserById(ownerId)
    const to = user.user?.email
    if (!to) continue

    const lines: DqReminderLine[] = entries
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((entry) => ({
        driverName: names.get(entry.item.driver_id) ?? "A driver",
        item: `${titles.get(entry.item.template_id) ?? entry.item.template_code}${entry.item.license_state ? ` (${entry.item.license_state})` : ""}`,
        ...describe(entry.item, entry.date, today),
      }))
    const error = await sendDqReminderEmail({
      to,
      organizationName: organization.name,
      lines,
      link: `${appUrl}/org/${organization.slug}/drivers`,
    })
    if (error) {
      emailErrors.push(`${organization.slug}: ${error}`)
      continue
    }
    const { error: recordError } = await admin.from("dq_reminders").upsert(
      entries.map((entry) => ({
        organization_id: organizationId,
        dq_item_id: entry.item.id,
        reminder: entry.key,
        due_on: entry.date,
        sent_to: to,
      })),
      { onConflict: "dq_item_id,reminder,due_on", ignoreDuplicates: true }
    )
    if (recordError)
      emailErrors.push(`${organization.slug}: ${recordError.message}`)
    remindersSent += entries.length
  }

  return {
    drivers: drivers.length,
    itemsAdded: toAdd.length,
    remindersSent,
    emailErrors,
  }
}
