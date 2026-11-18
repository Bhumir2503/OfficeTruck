import "server-only"

import { cache } from "react"

import {
  currentItems,
  driverStatus,
  itemStatus,
  type DqDriverStatus,
  type DqItem,
} from "@/lib/dq-rules"
import { dqComplianceDates, type DqComplianceDates } from "@/lib/driver-format"
import { createClient } from "@/lib/supabase/server"

/*
 * Organization-wide reads for the DQ screens: the fleet view's one row per
 * driver, and the open items the compliance calendar lists. Row-level
 * security limits what each person gets (members: the standard file only).
 */

type FleetItem = DqItem & {
  id: string
  driver_id: string
  template_id: string
  file_type: "dq" | "investigation" | "drug_alcohol"
}

// Cached for the request: the drivers page and dashboard read it twice.
const loadOrganizationItems = cache(async (organizationId: string) => {
  const supabase = await createClient()
  const [items, documents, signatures, templates] = await Promise.all([
    supabase
      .from("dq_items")
      .select(
        "id, driver_id, template_id, template_code, file_type, license_state, cycle_number, due_date, completed_at, valid_until, not_applicable_reason"
      )
      .eq("organization_id", organizationId),
    supabase
      .from("dq_documents")
      .select("dq_item_id")
      .eq("organization_id", organizationId)
      .is("confirmed_at", null)
      .is("superseded_at", null),
    supabase
      .from("dq_attestations")
      .select("dq_item_id")
      .eq("organization_id", organizationId)
      .is("voided_at", null),
    supabase.from("dq_requirement_templates").select("id, title"),
  ])
  const waiting = new Set(
    [
      ...((documents.data ?? []) as { dq_item_id: string }[]),
      ...((signatures.data ?? []) as { dq_item_id: string }[]),
    ].map((row) => row.dq_item_id)
  )
  const rows = ((items.data ?? []) as Omit<FleetItem, "pending_review">[]).map(
    (item) => ({
      ...item,
      pending_review: !item.completed_at && waiting.has(item.id),
    })
  )
  const titles = new Map(
    ((templates.data ?? []) as { id: string; title: string }[]).map((t) => [
      t.id,
      t.title,
    ])
  )
  return { items: rows, titles }
})

export type FleetRow = {
  driverId: string
  status: DqDriverStatus
  /** Waiting for an owner or admin to confirm. */
  pendingReview: number
}

/** Each driver's standard DQ file status, keyed by driver. */
export async function getFleetStatus(
  organizationId: string,
  today: string
): Promise<Map<string, FleetRow>> {
  const { items } = await loadOrganizationItems(organizationId)
  const byDriver = new Map<string, FleetItem[]>()
  for (const item of items) {
    if (item.file_type !== "dq") continue
    const list = byDriver.get(item.driver_id) ?? []
    list.push(item)
    byDriver.set(item.driver_id, list)
  }
  const rows = new Map<string, FleetRow>()
  for (const [driverId, list] of byDriver) {
    const status = driverStatus(list, today)
    rows.set(driverId, {
      driverId,
      status,
      pendingReview:
        status.status === "not_audit_ready" ? status.pendingReview : 0,
    })
  }
  return rows
}

export type DqCalendarItem = {
  itemId: string
  driverId: string
  title: string
  /** When it's due, or when a completed one runs out. */
  date: string | null
  /** True when it's a completed item running out, not an open one. */
  expires: boolean
}

/**
 * The DQ items that are tasks on the compliance calendar: the latest cycle
 * of each, open or running out, that isn't marked not applicable.
 */
export async function getDqCalendar(
  organizationId: string,
  today: string
): Promise<DqCalendarItem[]> {
  const { items, titles } = await loadOrganizationItems(organizationId)
  const byDriver = new Map<string, FleetItem[]>()
  for (const item of items) {
    const list = byDriver.get(item.driver_id) ?? []
    list.push(item)
    byDriver.set(item.driver_id, list)
  }
  const calendar: DqCalendarItem[] = []
  for (const list of byDriver.values()) {
    for (const item of currentItems(list)) {
      const status = itemStatus(item, today)
      if (status === "not_applicable" || status === "complete") continue
      if (item.completed_at && !item.valid_until) continue
      calendar.push({
        itemId: item.id,
        driverId: item.driver_id,
        title: `${titles.get(item.template_id) ?? item.template_code}${item.license_state ? ` (${item.license_state})` : ""}`,
        date: item.completed_at ? item.valid_until : item.due_date,
        expires: !!item.completed_at,
      })
    }
  }
  return calendar
}

/**
 * Each driver's qualification file dates (medical proof, annual review,
 * Clearinghouse query), for the side panel, drivers list and dashboard.
 * Drivers whose file isn't set up have no entry.
 */
export async function getDqDatesByDriver(
  organizationId: string
): Promise<Record<string, DqComplianceDates>> {
  const { items } = await loadOrganizationItems(organizationId)
  const byDriver = new Map<string, FleetItem[]>()
  for (const item of items) {
    const list = byDriver.get(item.driver_id) ?? []
    list.push(item)
    byDriver.set(item.driver_id, list)
  }
  return Object.fromEntries(
    [...byDriver].map(([id, list]) => [id, dqComplianceDates(list)])
  )
}
