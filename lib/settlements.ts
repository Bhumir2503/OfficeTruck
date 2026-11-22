import { loadDriverPay } from "@/lib/driver-format"
import { cityState } from "@/lib/report-format"
import type { PayType } from "@/lib/schemas/driver"
import {
  PAYABLE_STATUSES,
  settlementTotals,
  weekRange,
  type SettlementAdjustment,
  type SettlementExpense,
  type SettlementLoad,
  type SettlementTotals,
} from "@/lib/settlement-format"
import { createClient } from "@/lib/supabase/server"

type SettlementRow = {
  id: string
  driver_id: string
  week_start: string
  status: "open" | "paid"
  notes: string | null
  paid_on: string | null
  load_ids: string[] | null
  gross_pay: number | string | null
  reimbursements: number | string | null
  adjustments: number | string | null
  net_pay: number | string | null
}

type LoadRow = {
  id: string
  reference: string
  driver_id: string | null
  delivery_start: string
  rate: number | string
  miles: number | null
  driver_pay_type: PayType | null
  driver_pay_rate: number | string | null
  pickup_location: string
  delivery_location: string
}

const LOAD_COLUMNS =
  "id, reference, driver_id, delivery_start, rate, miles, driver_pay_type, driver_pay_rate, pickup_location, delivery_location"

function toLoad(row: LoadRow): SettlementLoad {
  const rate = Number(row.rate)
  return {
    id: row.id,
    reference: row.reference,
    delivery_start: row.delivery_start,
    rate,
    miles: row.miles,
    pay: loadDriverPay({
      driver_pay_type: row.driver_pay_type,
      driver_pay_rate:
        row.driver_pay_rate === null ? null : Number(row.driver_pay_rate),
      rate,
      miles: row.miles,
    }),
    route: `${cityState(row.pickup_location)} → ${cityState(row.delivery_location)}`,
  }
}

/** One driver's week: the loads and money behind it, and where it stands. */
export type Settlement = {
  driver: { id: string; full_name: string; email: string | null }
  week: string
  /** Null until there's an adjustment, a note or a payment to keep. */
  id: string | null
  status: "open" | "paid"
  paid_on: string | null
  notes: string | null
  loads: SettlementLoad[]
  expenses: SettlementExpense[]
  adjustments: SettlementAdjustment[]
  /** Live while open; what was frozen when it was paid. */
  totals: SettlementTotals
}

/**
 * Every driver's settlement for a week: active drivers, and anyone else
 * with loads or a settlement that week. Paid weeks show what was paid.
 */
export async function getPayWeek(
  organizationId: string,
  week: string
): Promise<Settlement[]> {
  const supabase = await createClient()
  const { from, to } = weekRange(week)
  const [drivers, loads, settlements] = await Promise.all([
    supabase
      .from("drivers")
      .select("id, full_name, email, status")
      .eq("organization_id", organizationId)
      .order("full_name"),
    supabase
      .from("loads")
      .select(LOAD_COLUMNS)
      .eq("organization_id", organizationId)
      .in("status", PAYABLE_STATUSES)
      .not("driver_id", "is", null)
      .gte("delivery_start", `${from}T00:00:00`)
      .lt("delivery_start", `${to}T00:00:00`)
      .order("delivery_start"),
    supabase
      .from("driver_settlements")
      .select(
        "id, driver_id, week_start, status, notes, paid_on, load_ids, gross_pay, reimbursements, adjustments, net_pay"
      )
      .eq("organization_id", organizationId)
      .eq("week_start", week),
  ])
  for (const result of [drivers, loads, settlements]) {
    if (result.error) throw result.error
  }
  const rows = settlements.data as SettlementRow[]
  const loadRows = loads.data as LoadRow[]

  // A paid week keeps the loads it paid for, even if one moved since.
  const paidIds = rows.flatMap((row) => row.load_ids ?? [])
  const missing = paidIds.filter((id) => !loadRows.some((l) => l.id === id))
  if (missing.length) {
    const { data, error } = await supabase
      .from("loads")
      .select(LOAD_COLUMNS)
      .eq("organization_id", organizationId)
      .in("id", missing)
    if (error) throw error
    loadRows.push(...(data as LoadRow[]))
  }

  const allLoadIds = [...new Set(loadRows.map((load) => load.id))]
  const settlementIds = rows.map((row) => row.id)
  const [expenses, adjustments] = await Promise.all([
    allLoadIds.length
      ? supabase
          .from("load_expenses")
          .select("id, load_id, kind, amount, spent_on, note")
          .eq("organization_id", organizationId)
          .eq("paid_by", "driver")
          .in("load_id", allLoadIds)
          .order("spent_on")
      : Promise.resolve({ data: [], error: null }),
    settlementIds.length
      ? supabase
          .from("driver_settlement_adjustments")
          .select("id, settlement_id, description, amount")
          .eq("organization_id", organizationId)
          .in("settlement_id", settlementIds)
          .order("created_at")
      : Promise.resolve({ data: [], error: null }),
  ])
  if (expenses.error) throw expenses.error
  if (adjustments.error) throw adjustments.error

  return (
    drivers.data as {
      id: string
      full_name: string
      email: string | null
      status: string
    }[]
  )
    .map((driver): Settlement | null => {
      const row = rows.find((r) => r.driver_id === driver.id) ?? null
      const paid = row?.status === "paid"
      const driverLoads = (
        paid
          ? loadRows.filter((load) => row!.load_ids!.includes(load.id))
          : loadRows.filter((load) => load.driver_id === driver.id)
      )
        .filter(
          (load, index, list) =>
            list.findIndex((other) => other.id === load.id) === index
        )
        .map(toLoad)
      if (!row && driverLoads.length === 0 && driver.status !== "active") {
        return null
      }
      const ids = new Set(driverLoads.map((load) => load.id))
      const driverExpenses = (expenses.data ?? [])
        .filter((expense) => ids.has(expense.load_id))
        .map((expense) => ({ ...expense, amount: Number(expense.amount) }))
      const driverAdjustments = (adjustments.data ?? [])
        .filter((adjustment) => adjustment.settlement_id === row?.id)
        .map(({ id, description, amount }) => ({
          id,
          description,
          amount: Number(amount),
        }))
      const live = settlementTotals(
        driverLoads,
        driverExpenses,
        driverAdjustments
      )
      return {
        driver: {
          id: driver.id,
          full_name: driver.full_name,
          email: driver.email,
        },
        week,
        id: row?.id ?? null,
        status: row?.status ?? "open",
        paid_on: row?.paid_on ?? null,
        notes: row?.notes ?? null,
        loads: driverLoads,
        expenses: driverExpenses,
        adjustments: driverAdjustments,
        totals: paid
          ? {
              ...live,
              gross: Number(row!.gross_pay),
              reimbursements: Number(row!.reimbursements),
              adjustments: Number(row!.adjustments),
              net: Number(row!.net_pay),
            }
          : live,
      }
    })
    .filter((settlement): settlement is Settlement => settlement !== null)
}

/** One driver's settlement for a week, or null if the driver isn't found. */
export async function getSettlement(
  organizationId: string,
  driverId: string,
  week: string
) {
  const week_ = await getPayWeek(organizationId, week)
  return week_.find((settlement) => settlement.driver.id === driverId) ?? null
}

/** A week already paid to a driver, as it was frozen when marked paid. */
export type PaidWeek = {
  week: string
  paid_on: string
  loads: number
  gross: number
  reimbursements: number
  adjustments: number
  net: number
}

/** The weeks a driver has been paid, newest first. Owners and admins only. */
export async function getPaidWeeks(
  organizationId: string,
  driverId: string
): Promise<PaidWeek[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("driver_settlements")
    .select(
      "week_start, paid_on, load_ids, gross_pay, reimbursements, adjustments, net_pay"
    )
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .eq("status", "paid")
    .order("week_start", { ascending: false })
  if (error) throw error
  return (data as SettlementRow[]).map((row) => ({
    week: row.week_start,
    paid_on: row.paid_on!,
    loads: row.load_ids?.length ?? 0,
    gross: Number(row.gross_pay ?? 0),
    reimbursements: Number(row.reimbursements ?? 0),
    adjustments: Number(row.adjustments ?? 0),
    net: Number(row.net_pay ?? 0),
  }))
}
