import { loadDriverPay } from "@/lib/driver-format"
import {
  cityState,
  REPORTED_STATUSES,
  type ReportLoad,
} from "@/lib/report-format"
import type { PayType } from "@/lib/schemas/driver"
import type { LoadStatus } from "@/lib/schemas/load"
import { fetchAll } from "@/lib/supabase/paging"
import { createClient } from "@/lib/supabase/server"

type Row = {
  id: string
  load_expenses: { amount: number | string; paid_by: string }[]
  reference: string
  status: LoadStatus
  delivery_start: string
  /** The day it was really delivered, set by the database. */
  delivered_on: string | null
  rate: number | string
  miles: number | null
  empty_miles: number | null
  driver_pay_type: PayType | null
  driver_pay_rate: number | string | null
  tonu_driver_pay: number | string | null
  pickup_location: string
  delivery_location: string
  broker_name: string
  broker_id: string | null
  broker: { legal_name: string } | null
  driver_name: string | null
  driver_id: string | null
  driver: { full_name: string } | null
  truck: string | null
  truck_id: string | null
  truck_link: { unit_number: string } | null
}

const COLUMNS =
  "id, reference, status, delivery_start, delivered_on, rate, miles, empty_miles, driver_pay_type, driver_pay_rate, tonu_driver_pay, pickup_location, delivery_location, broker_name, broker_id, broker:brokers!loads_broker_fkey (legal_name), driver_name, driver_id, driver:drivers!loads_driver_fkey (full_name), truck, truck_id, truck_link:trucks!loads_truck_fkey (unit_number), load_expenses (amount, paid_by)"

/** Every delivered (or further along) load, with its pay and expenses totalled. */
export async function getReportLoads(
  organizationId: string,
  /**
   * "YYYY-MM-DD": only loads delivered from this day on (a TONU, with no
   * delivery, by its delivery date). All of them when left out.
   */
  since?: string
): Promise<ReportLoad[]> {
  const supabase = await createClient()
  const data = await fetchAll((from, to) => {
    const query = supabase
      .from("loads")
      .select(COLUMNS)
      .eq("organization_id", organizationId)
      .in("status", REPORTED_STATUSES)
    return (
      since
        ? query.or(
            `delivered_on.gte.${since},and(delivered_on.is.null,delivery_start.gte.${since})`
          )
        : query
    )
      .order("delivered_on", { ascending: false })
      .order("id")
      .range(from, to)
  })
  const rows = data as unknown as Row[]

  // What the company spent on each load. Not the expenses taken off the
  // driver's pay: the driver pays those.
  const expenses = new Map<string, number>()
  for (const row of rows) {
    expenses.set(
      row.id,
      row.load_expenses
        .filter((expense) => expense.paid_by !== "deduct")
        .reduce((sum, expense) => sum + Number(expense.amount), 0)
    )
  }

  return rows.map((row) => {
    const rate = Number(row.rate)
    const tonu = row.status === "tonu"
    const pay = loadDriverPay({
      driver_pay_type: row.driver_pay_type,
      driver_pay_rate:
        row.driver_pay_rate === null ? null : Number(row.driver_pay_rate),
      rate,
      miles: row.miles,
      status: row.status,
      tonu_driver_pay: row.tonu_driver_pay,
    })
    const driverName = row.driver?.full_name ?? row.driver_name
    const truckName = row.truck_link?.unit_number ?? row.truck
    return {
      id: row.id,
      reference: row.reference,
      status: row.status,
      delivered_on: row.delivered_on ?? row.delivery_start.slice(0, 10),
      rate,
      // A TONU ran no miles, so it doesn't skew rate or cost per mile.
      miles: tonu ? null : row.miles,
      empty_miles: tonu ? null : row.empty_miles,
      driver_pay: pay,
      pay_unknown: pay === null && row.driver_pay_type !== null,
      expenses: expenses.get(row.id) ?? 0,
      truck: truckName
        ? { id: row.truck_link ? row.truck_id : null, name: truckName }
        : null,
      driver: driverName
        ? { id: row.driver ? row.driver_id : null, name: driverName }
        : null,
      broker: {
        id: row.broker ? row.broker_id : null,
        name: row.broker?.legal_name ?? row.broker_name,
      },
      origin: cityState(row.pickup_location),
      destination: cityState(row.delivery_location),
    }
  })
}
