"use server"

import { refresh } from "next/cache"

import { canManage, getMyOrganizations } from "@/lib/organizations"
import {
  parseAdjustment,
  parsePeriod,
  periodEnd,
  type PayPeriod,
} from "@/lib/settlement-format"
import { getSettlement, periodRow } from "@/lib/settlements"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { ok: true }

const NOT_ALLOWED = "Only owners and admins can manage driver pay."
const PAID = "This pay period is already paid. Undo the payment to change it."

async function allowed(organizationId: string) {
  const organization = (await getMyOrganizations()).find(
    (org) => org.id === organizationId
  )
  return !!organization && canManage(organization)
}

/** How often a driver is paid, read here rather than trusted from the page. */
async function driverPeriod(
  organizationId: string,
  driverId: string
): Promise<PayPeriod | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("drivers")
    .select("pay_period")
    .eq("organization_id", organizationId)
    .eq("id", driverId)
    .maybeSingle()
  return (data as { pay_period: PayPeriod } | null)?.pay_period ?? null
}

/**
 * The settlement row for a driver's pay period, made if it doesn't exist
 * yet. An open one from before a schedule change takes the new end date, so
 * its adjustments carry over.
 */
async function settlementId(
  organizationId: string,
  driverId: string,
  start: string,
  end: string
): Promise<{ id: string; status: string } | { error: string }> {
  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from("driver_settlements")
    .select("id, status, week_start, period_end")
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .eq("week_start", start)
  if (error) return { error: error.message }
  const found = periodRow(
    (rows ?? []) as {
      id: string
      status: string
      week_start: string
      period_end: string
    }[],
    start,
    end
  )
  if (found) {
    if (found.status === "open" && found.period_end !== end) {
      const update = await supabase
        .from("driver_settlements")
        .update({ period_end: end })
        .eq("organization_id", organizationId)
        .eq("id", found.id)
      if (update.error) return { error: update.error.message }
    }
    return { id: found.id, status: found.status }
  }

  const { data, error: insertError } = await supabase
    .from("driver_settlements")
    .insert({
      organization_id: organizationId,
      driver_id: driverId,
      week_start: start,
      period_end: end,
    })
    .select("id, status")
    .single()
  if (insertError) return { error: insertError.message }
  return data
}

/** Adds money to, or takes it off, a driver's pay period. */
export async function addAdjustment(
  organizationId: string,
  driverId: string,
  weekInput: string,
  input: { description: string; amount: string; direction: "add" | "deduct" }
): Promise<ActionResult> {
  if (!(await allowed(organizationId))) return { error: NOT_ALLOWED }
  const period = await driverPeriod(organizationId, driverId)
  if (!period) return { error: "That driver isn't in this organization." }
  const week = parsePeriod(weekInput, period)
  if (!week) return { error: "Choose a pay period." }
  const description = input.description.trim()
  if (!description) return { error: "Say what it's for." }
  if (description.length > 200) {
    return { error: "Must be 200 characters or fewer." }
  }
  const amount = parseAdjustment(input.amount, input.direction)
  if ("error" in amount) return amount

  const settlement = await settlementId(
    organizationId,
    driverId,
    week,
    periodEnd(week, period)
  )
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
  const period = await driverPeriod(organizationId, driverId)
  if (!period) return { error: "That driver isn't in this organization." }
  const week = parsePeriod(weekInput, period)
  if (!week) return { error: "Choose a pay period." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
    return { error: "Enter the date it was paid." }
  }

  const current = await getSettlement(organizationId, driverId, week, period)
  if (!current) return { error: "That driver isn't in this organization." }
  if (current.status === "paid") return { error: "Already marked paid." }
  if (
    current.loads.length === 0 &&
    current.adjustments.length === 0 &&
    // A late receipt alone is still money owed.
    current.expenses.length === 0
  ) {
    return { error: "Nothing to pay this period." }
  }
  if (current.totals.unpriced > 0) {
    return {
      error:
        "Some loads have per-mile pay but no miles. Add the miles first so the pay is right.",
    }
  }

  const settlement = await settlementId(
    organizationId,
    driverId,
    week,
    current.end
  )
  if ("error" in settlement) return settlement

  const supabase = await createClient()
  // Adjustments left on an earlier schedule's open period inside this one
  // move here first (copied, then the originals removed), while this one
  // is still open, so they're paid once and kept with what was paid.
  if (current.mergedFrom.length) {
    const { data: strays, error: strayError } = await supabase
      .from("driver_settlement_adjustments")
      .select("id, description, amount")
      .eq("organization_id", organizationId)
      .in("settlement_id", current.mergedFrom)
    if (strayError) return { error: strayError.message }
    const moving = (strays ?? []) as {
      id: string
      description: string
      amount: number
    }[]
    if (moving.length) {
      const copied = await supabase
        .from("driver_settlement_adjustments")
        .insert(
          moving.map(({ description, amount }) => ({
            organization_id: organizationId,
            settlement_id: settlement.id,
            description,
            amount,
          }))
        )
      if (copied.error) return { error: copied.error.message }
      const removed = await supabase
        .from("driver_settlement_adjustments")
        .delete()
        .eq("organization_id", organizationId)
        .in(
          "id",
          moving.map((adjustment) => adjustment.id)
        )
      if (removed.error) return { error: removed.error.message }
    }
  }

  const { data, error } = await supabase
    .from("driver_settlements")
    .update({
      status: "paid",
      paid_on: paidOn,
      load_ids: current.loads.map((load) => load.id),
      // The lines as paid, so later edits to a load don't rewrite them.
      paid_lines: { loads: current.loads, expenses: current.expenses },
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
      paid_lines: null,
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
