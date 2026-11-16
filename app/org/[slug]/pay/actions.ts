"use server"

import { refresh } from "next/cache"

import { canManage, getMyOrganizations } from "@/lib/organizations"
import { parseAdjustment, parseWeek } from "@/lib/settlement-format"
import { getSettlement } from "@/lib/settlements"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { ok: true }

const NOT_ALLOWED = "Only owners and admins can manage driver pay."
const PAID = "This week is already paid. Undo the payment to change it."

async function allowed(organizationId: string) {
  const organization = (await getMyOrganizations()).find(
    (org) => org.id === organizationId
  )
  return !!organization && canManage(organization)
}

/** The settlement row for a driver's week, made if it doesn't exist yet. */
async function settlementId(
  organizationId: string,
  driverId: string,
  week: string
): Promise<{ id: string; status: string } | { error: string }> {
  const supabase = await createClient()
  const { data: found, error } = await supabase
    .from("driver_settlements")
    .select("id, status")
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .eq("week_start", week)
    .maybeSingle()
  if (error) return { error: error.message }
  if (found) return found

  const { data, error: insertError } = await supabase
    .from("driver_settlements")
    .insert({
      organization_id: organizationId,
      driver_id: driverId,
      week_start: week,
    })
    .select("id, status")
    .single()
  if (insertError) return { error: insertError.message }
  return data
}

/** Adds money to, or takes it off, a driver's week. */
export async function addAdjustment(
  organizationId: string,
  driverId: string,
  weekInput: string,
  input: { description: string; amount: string; direction: "add" | "deduct" }
): Promise<ActionResult> {
  if (!(await allowed(organizationId))) return { error: NOT_ALLOWED }
  const week = parseWeek(weekInput)
  if (!week) return { error: "Choose a pay week." }
  const description = input.description.trim()
  if (!description) return { error: "Say what it's for." }
  if (description.length > 200) {
    return { error: "Must be 200 characters or fewer." }
  }
  const amount = parseAdjustment(input.amount, input.direction)
  if ("error" in amount) return amount

  const settlement = await settlementId(organizationId, driverId, week)
  if ("error" in settlement) return settlement
  if (settlement.status === "paid") return { error: PAID }

  const supabase = await createClient()
  const { error } = await supabase
    .from("driver_settlement_adjustments")
    .insert({
      organization_id: organizationId,
      settlement_id: settlement.id,
      description,
      amount: amount.amount,
    })
  if (error) return { error: error.message }
  refresh()
  return { ok: true }
}

export async function removeAdjustment(
  organizationId: string,
  adjustmentId: string
): Promise<ActionResult> {
  if (!(await allowed(organizationId))) return { error: NOT_ALLOWED }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("driver_settlement_adjustments")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", adjustmentId)
    .select("id")
  if (error) return { error: error.message }
  if (!data.length) return { error: "That adjustment is already gone." }
  refresh()
  return { ok: true }
}

/**
 * Marks a driver's week paid, freezing the loads and totals as they are now,
 * worked out again here rather than trusted from the page.
 */
export async function markPaid(
  organizationId: string,
  driverId: string,
  weekInput: string,
  paidOn: string
): Promise<ActionResult> {
  if (!(await allowed(organizationId))) return { error: NOT_ALLOWED }
  const week = parseWeek(weekInput)
  if (!week) return { error: "Choose a pay week." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
    return { error: "Enter the date it was paid." }
  }

  const current = await getSettlement(organizationId, driverId, week)
  if (!current) return { error: "That driver isn't in this organization." }
  if (current.status === "paid") return { error: "Already marked paid." }
  if (current.loads.length === 0 && current.adjustments.length === 0) {
    return { error: "Nothing to pay this week." }
  }
  if (current.totals.unpriced > 0) {
    return {
      error:
        "Some loads have per-mile pay but no miles. Add the miles first so the pay is right.",
    }
  }

  const settlement = await settlementId(organizationId, driverId, week)
  if ("error" in settlement) return settlement

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("driver_settlements")
    .update({
      status: "paid",
      paid_on: paidOn,
      load_ids: current.loads.map((load) => load.id),
      gross_pay: current.totals.gross,
      reimbursements: current.totals.reimbursements,
      adjustments: current.totals.adjustments,
      net_pay: current.totals.net,
    })
    .eq("organization_id", organizationId)
    .eq("id", settlement.id)
    .eq("status", "open")
    .select("id")
  if (error) return { error: error.message }
  if (!data.length) return { error: "Already marked paid." }
  refresh()
  return { ok: true }
}

/** Reopens a paid week, so its loads and adjustments count live again. */
export async function undoPaid(
  organizationId: string,
  settlementId: string
): Promise<ActionResult> {
  if (!(await allowed(organizationId))) return { error: NOT_ALLOWED }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("driver_settlements")
    .update({
      status: "open",
      paid_on: null,
      load_ids: null,
      gross_pay: null,
      reimbursements: null,
      adjustments: null,
      net_pay: null,
    })
    .eq("organization_id", organizationId)
    .eq("id", settlementId)
    .eq("status", "paid")
    .select("id")
  if (error) return { error: error.message }
  if (!data.length) return { error: "It isn't marked paid." }
  refresh()
  return { ok: true }
}
