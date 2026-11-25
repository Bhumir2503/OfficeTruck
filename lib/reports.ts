import { loadDriverPay } from "@/lib/driver-format"
import {
  cityState,
  REPORTED_STATUSES,
  type ReportLoad,
} from "@/lib/report-format"
import type { PayType } from "@/lib/schemas/driver"
import type { LoadStatus } from "@/lib/schemas/load"
import { createClient } from "@/lib/supabase/server"

type Row = {
  id: string
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
  "id, reference, status, delivery_start, delivered_on, rate, miles, empty_miles, driver_pay_type, driver_pay_rate, pickup_location, delivery_location, broker_name, broker_id, broker:brokers!loads_broker_fkey (legal_name), driver_name, driver_id, driver:drivers!loads_driver_fkey (full_name), truck, truck_id, truck_link:trucks!loads_truck_fkey (unit_number)"

/** Every delivered (or further along) load, with its pay and expenses totalled. */
export async function getReportLoads(
  organizationId: string
): Promise<ReportLoad[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("loads")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .in("status", REPORTED_STATUSES)
    .order("delivered_on", { ascending: false })
  if (error) {
    throw error
  }
  const rows = data as unknown as Row[]

  const expenses = new Map<string, number>()
  if (rows.length) {
    const { data: spent, error: spentError } = await supabase
      .from("load_expenses")
      .select("load_id, amount")
      .eq("organization_id", organizationId)
      .in(
        "load_id",
        rows.map((row) => row.id)
      )
    if (spentError) {
      throw spentError
    }
    for (const expense of spent) {
      expenses.set(
        expense.load_id,
        (expenses.get(expense.load_id) ?? 0) + Number(expense.amount)
      )
    }
  }

  return rows.map((row) => {
    const rate = Number(row.rate)
    const pay = loadDriverPay({
      driver_pay_type: row.driver_pay_type,
      driver_pay_rate:
        row.driver_pay_rate === null ? null : Number(row.driver_pay_rate),
      rate,
      miles: row.miles,
    })
    const driverName = row.driver?.full_name ?? row.driver_name
    const truckName = row.truck_link?.unit_number ?? row.truck
    return {
      id: row.id,
      reference: row.reference,
      status: row.status,
      delivered_on: row.delivered_on ?? row.delivery_start.slice(0, 10),
      rate,
      miles: row.miles,
      empty_miles: row.empty_miles,
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
