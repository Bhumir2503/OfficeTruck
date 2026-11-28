import { loadDriverPay } from "@/lib/driver-format"
import { cityState } from "@/lib/report-format"
import type { PayType } from "@/lib/schemas/driver"
import {
  PAYABLE_STATUSES,
  periodEnd,
  settlementTotals,
  type PayPeriod,
  type SettlementAdjustment,
  type SettlementExpense,
  type SettlementLoad,
  type SettlementTotals,
} from "@/lib/settlement-format"
import { fetchAll } from "@/lib/supabase/paging"
import { createClient } from "@/lib/supabase/server"

type SettlementRow = {
  id: string
  driver_id: string
  week_start: string
  /** The period's last day. */
  period_end: string
  status: "open" | "paid"
  notes: string | null
  paid_on: string | null
  load_ids: string[] | null
  /** The lines as they were paid; null while open and for older weeks. */
  paid_lines: { loads: SettlementLoad[]; expenses: SettlementExpense[] } | null
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
  delivered_on: string | null
  rate: number | string
  miles: number | null
  driver_pay_type: PayType | null
  driver_pay_rate: number | string | null
  tonu_driver_pay: number | string | null
  status: string
  pickup_location: string
  delivery_location: string
}

const LOAD_COLUMNS =
  "id, reference, status, driver_id, delivery_start, delivered_on, rate, miles, driver_pay_type, driver_pay_rate, tonu_driver_pay, pickup_location, delivery_location"

/** The day after `day` ("YYYY-MM-DD"). */
const dayAfter = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10)

function toLoad(row: LoadRow): SettlementLoad {
  const rate = Number(row.rate)
  return {
    id: row.id,
    reference: row.reference,
    delivery_start: row.delivery_start,
    delivered_on: row.delivered_on,
    rate,
    miles: row.miles,
    tonu: row.status === "tonu",
    pay: loadDriverPay({
      driver_pay_type: row.driver_pay_type,
      driver_pay_rate:
        row.driver_pay_rate === null ? null : Number(row.driver_pay_rate),
      rate,
      miles: row.miles,
      status: row.status,
      tonu_driver_pay: row.tonu_driver_pay,
    }),
    route: `${cityState(row.pickup_location)} → ${cityState(row.delivery_location)}`,
  }
}

/**
 * One driver's pay period (a week, 2 weeks or a month): the loads and money
 * behind it, and where it stands.
 */
export type Settlement = {
  driver: { id: string; full_name: string; email: string | null }
  /** The period's first day. */
  week: string
  /** The period's last day. */
  end: string
  /** Null until there's an adjustment, a note or a payment to keep. */
  id: string | null
  status: "open" | "paid"
  paid_on: string | null
  notes: string | null
  loads: SettlementLoad[]
  expenses: SettlementExpense[]
  adjustments: SettlementAdjustment[]
  /**
   * Other open periods starting inside this one, left from an earlier
   * schedule: their adjustments count here, and move here when it's paid.
   */
  mergedFrom: string[]
  /** Live while open; what was frozen when it was paid. */
  totals: SettlementTotals
}

/**
 * The row for the period `start`–`end` among a driver's settlements: the
 * one with exactly those dates, or else an open one starting the same day
 * (from before a schedule change; it takes the new end). A paid row with
 * other dates is a different period, never this one.
 */
export function periodRow<
  T extends { week_start: string; period_end: string; status: string },
>(rows: T[], start: string, end: string): T | null {
  return (
    rows.find((r) => r.week_start === start && r.period_end === end) ??
    rows.find((r) => r.week_start === start && r.status === "open") ??
    null
  )
}

/**
 * A driver's settlement for the pay period starting `start`, or null if
 * the driver isn't found. An open period takes the driver's loads
 * delivered in it, less any already paid in another period (the schedule
 * may have changed since); a paid one shows what was paid.
 */
export async function getSettlement(
  organizationId: string,
  driverId: string,
  start: string,
  period: PayPeriod,
  /**
   * A paid period's own last day, from a Pay history link, when it differs
   * from what the driver's schedule gives (the schedule changed since).
   */
  endOverride?: string | null
): Promise<Settlement | null> {
  const supabase = await createClient()
  const end =
    endOverride && endOverride >= start ? endOverride : periodEnd(start, period)
  // Loads delivered (the day they really were) from the first day up to
  // the end of the last.
  const from = start
  const to = dayAfter(end)
  const [driver, loads, settlements] = await Promise.all([
    supabase
      .from("drivers")
      .select("id, full_name, email")
      .eq("organization_id", organizationId)
      .eq("id", driverId)
      .maybeSingle(),
    supabase
      .from("loads")
      .select(LOAD_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("driver_id", driverId)
      .in("status", PAYABLE_STATUSES)
      .gte("delivered_on", from)
      .lt("delivered_on", to)
      .order("delivered_on"),
    supabase
      .from("driver_settlements")
      .select(
        "id, driver_id, week_start, period_end, status, notes, paid_on, load_ids, paid_lines, gross_pay, reimbursements, adjustments, net_pay"
      )
      .eq("organization_id", organizationId)
      .eq("driver_id", driverId),
  ])
  for (const result of [driver, loads, settlements]) {
    if (result.error) throw result.error
  }
  if (!driver.data) return null
  const rows = settlements.data as SettlementRow[]
  const row = periodRow(rows, start, end)
  const paid = row?.status === "paid"
  // Open periods from an earlier schedule that start inside this one (an
  // old week undone after a switch to 2 weeks, say). Their adjustments
  // belong here; left alone they'd never be paid.
  const strays = paid
    ? []
    : rows.filter(
        (r) =>
          r.status === "open" &&
          r.id !== row?.id &&
          r.week_start >= start &&
          r.week_start <= end
      )
  const adjustmentRows = [row, ...strays]
    .filter((r): r is SettlementRow => r !== null)
    .map((r) => r.id)

  let loadRows = loads.data as LoadRow[]
  if (paid) {
    // A paid period keeps the loads it paid for, even if one moved since.
    const missing = row!.load_ids!.filter(
      (id) => !loadRows.some((load) => load.id === id)
    )
    if (missing.length) {
      const { data, error } = await supabase
        .from("loads")
        .select(LOAD_COLUMNS)
        .eq("organization_id", organizationId)
        .in("id", missing)
      if (error) throw error
      loadRows.push(...(data as LoadRow[]))
    }
    loadRows = loadRows.filter((load) => row!.load_ids!.includes(load.id))
  } else {
    // Never pay a load twice: leave out ones another period already paid.
    const paidElsewhere = new Set(
      rows
        .filter((r) => r.status === "paid" && r.id !== row?.id)
        .flatMap((r) => r.load_ids ?? [])
    )
    loadRows = loadRows.filter((load) => !paidElsewhere.has(load.id))
  }
  // A TONU is on the statement only when it pays the driver something.
  const driverLoads = loadRows
    .map(toLoad)
    .filter((load, i) => loadRows[i]!.status !== "tonu" || (load.pay ?? 0) > 0)

  const ids = driverLoads.map((load) => load.id)
  const [expenses, adjustments] = await Promise.all([
    ids.length
      ? supabase
          .from("load_expenses")
          .select("id, load_id, kind, amount, spent_on, note, paid_by")
          .eq("organization_id", organizationId)
          // Owed back, or taken off.
          .in("paid_by", ["driver", "deduct"])
          .in("load_id", ids)
          .order("spent_on")
      : Promise.resolve({ data: [], error: null }),
    adjustmentRows.length
      ? supabase
          .from("driver_settlement_adjustments")
          .select("id, description, amount")
          .eq("organization_id", organizationId)
          .in("settlement_id", adjustmentRows)
          .order("created_at")
      : Promise.resolve({ data: [], error: null }),
  ])
  if (expenses.error) throw expenses.error
  if (adjustments.error) throw adjustments.error

  const liveExpenses = (expenses.data ?? []).map(({ paid_by, ...expense }) => ({
    ...expense,
    amount:
      paid_by === "deduct" ? -Number(expense.amount) : Number(expense.amount),
    ...(paid_by === "deduct" ? { deducted: true } : {}),
  }))
  const driverAdjustments = (adjustments.data ?? []).map(
    ({ id, description, amount }) => ({
      id,
      description,
      amount: Number(amount),
    })
  )
  // A paid period shows its lines as they were paid, when they were kept.
  const frozen = paid ? row!.paid_lines : null
  const shownLoads = frozen?.loads ?? driverLoads
  const shownExpenses = frozen?.expenses ?? liveExpenses
  const live = settlementTotals(shownLoads, shownExpenses, driverAdjustments)
  const info = driver.data as {
    id: string
    full_name: string
    email: string | null
  }

  return {
    driver: info,
    week: start,
    // A paid period keeps the dates it was paid for.
    end: paid ? row!.period_end : end,
    id: row?.id ?? null,
    status: row?.status ?? "open",
    paid_on: row?.paid_on ?? null,
    notes: row?.notes ?? null,
    loads: shownLoads,
    expenses: shownExpenses,
    adjustments: driverAdjustments,
    mergedFrom: strays.map((r) => r.id),
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
}

/** A period already paid to a driver, as it was frozen when marked paid. */
export type PaidWeek = {
  /** The period's first day. */
  week: string
  /** Its last day. */
  end: string
  paid_on: string
  loads: number
  gross: number
  reimbursements: number
  adjustments: number
  net: number
}

/** The periods a driver has been paid, newest first. Owners and admins only. */
export async function getPaidWeeks(
  organizationId: string,
  driverId: string
): Promise<PaidWeek[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("driver_settlements")
    .select(
      "week_start, period_end, paid_on, load_ids, gross_pay, reimbursements, adjustments, net_pay"
    )
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .eq("status", "paid")
    .order("week_start", { ascending: false })
  if (error) throw error
  return (data as SettlementRow[]).map((row) => ({
    week: row.week_start,
    end: row.period_end,
    paid_on: row.paid_on!,
    loads: row.load_ids?.length ?? 0,
    gross: Number(row.gross_pay ?? 0),
    reimbursements: Number(row.reimbursements ?? 0),
    adjustments: Number(row.adjustments ?? 0),
    net: Number(row.net_pay ?? 0),
  }))
}

/**
 * The earliest day, up to `through`, that the driver delivered a load not
 * yet on a paid statement: where the pay tab opens, so money owed isn't
 * hidden behind an empty period. Null when it's all paid.
 */
export async function getOldestUnpaidDay(
  organizationId: string,
  driverId: string,
  /** "YYYY-MM-DD", usually today. */
  through: string
): Promise<string | null> {
  const supabase = await createClient()
  // All of it: a driver's history passes 1,000 loads within a few years.
  const [loads, paid] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("loads")
        .select("id, delivered_on")
        .eq("organization_id", organizationId)
        .eq("driver_id", driverId)
        .in("status", PAYABLE_STATUSES)
        // A TONU that pays the driver nothing isn't owed.
        .or("status.neq.tonu,tonu_driver_pay.gt.0")
        .lte("delivered_on", through)
        .order("delivered_on")
        .order("id")
        .range(from, to)
    ),
    fetchAll((from, to) =>
      supabase
        .from("driver_settlements")
        .select("load_ids")
        .eq("organization_id", organizationId)
        .eq("driver_id", driverId)
        .eq("status", "paid")
        .order("id")
        .range(from, to)
    ),
  ])
  const done = new Set(
    (paid as { load_ids: string[] | null }[]).flatMap(
      (row) => row.load_ids ?? []
    )
  )
  const first = (loads as { id: string; delivered_on: string }[]).find(
    (load) => !done.has(load.id)
  )
  return first?.delivered_on ?? null
}
