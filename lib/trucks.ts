import type { PayType } from "@/lib/schemas/driver"
import type { LoadStatus } from "@/lib/schemas/load"
import type { Ownership, TruckStatus } from "@/lib/schemas/truck"
import { createClient } from "@/lib/supabase/server"

export type Truck = {
  id: string
  unit_number: string
  vin: string | null
  year: number | null
  make: string | null
  model: string | null
  plate_number: string | null
  plate_state: string | null
  status: TruckStatus
  ownership: Ownership | null
  default_driver_id: string | null
  default_driver: { id: string; full_name: string } | null
  motive_vehicle_id: string | null
  /** Dollars per month. */
  monthly_payment: number | null
  monthly_insurance: number | null
  monthly_other_costs: number | null
  /** When the annual DOT inspection was last done; due a year later. */
  annual_inspection_on: string | null
  registration_expires_on: string | null
  plate_expires_on: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

const TRUCK_COLUMNS =
  "id, unit_number, vin, year, make, model, plate_number, plate_state, status, ownership, default_driver_id, default_driver:drivers!trucks_default_driver_fkey (id, full_name), motive_vehicle_id, monthly_payment, monthly_insurance, monthly_other_costs, annual_inspection_on, registration_expires_on, plate_expires_on, notes, created_at, updated_at"

/** Every truck in the organization, by unit number. */
export async function getTrucks(organizationId: string): Promise<Truck[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trucks")
    .select(TRUCK_COLUMNS)
    .eq("organization_id", organizationId)
    .order("unit_number")

  if (error) {
    throw error
  }
  return data as unknown as Truck[]
}

/** One truck, or null if it isn't in this organization. */
export async function getTruck(
  organizationId: string,
  id: string
): Promise<Truck | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trucks")
    .select(TRUCK_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    // An id that isn't a UUID is just a truck that doesn't exist.
    if (error.code === "22P02") {
      return null
    }
    throw error
  }
  return data as unknown as Truck | null
}

/** A truck as listed in the load form's truck picker. */
export type TruckOption = {
  id: string
  unit_number: string
  status: TruckStatus
  default_driver_id: string | null
}

export async function getTruckOptions(
  organizationId: string
): Promise<TruckOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trucks")
    .select("id, unit_number, status, default_driver_id")
    .eq("organization_id", organizationId)
    .order("unit_number")

  if (error) {
    throw error
  }
  return data as TruckOption[]
}

export type TruckLoad = {
  id: string
  reference: string
  pickup_location: string
  delivery_location: string
  /** Wall-clock time at the stop, "YYYY-MM-DDTHH:mm:ss". */
  pickup_start: string
  rate: number
  miles: number | null
  empty_miles: number | null
  status: LoadStatus
  /** The pay rate locked onto the load when its driver was assigned. */
  driver_pay_type: PayType | null
  driver_pay_rate: number | null
  driver: {
    id: string
    full_name: string
    pay_type: PayType | null
    pay_rate: number | null
  } | null
}

/** The loads a truck has run, newest pickup first. */
export async function getTruckLoads(
  organizationId: string,
  truckId: string
): Promise<TruckLoad[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("loads")
    .select(
      "id, reference, pickup_location, delivery_location, pickup_start, rate, miles, empty_miles, status, driver_pay_type, driver_pay_rate, driver:drivers!loads_driver_fkey (id, full_name, pay_type, pay_rate)"
    )
    .eq("organization_id", organizationId)
    .eq("truck_id", truckId)
    .order("pickup_start", { ascending: false })

  if (error) {
    throw error
  }
  return data as unknown as TruckLoad[]
}

export type TaxFiling = {
  id: string
  tax_year: number
  filed_on: string
  notes: string | null
  truck_ids: string[]
}

/** Every 2290 the organization has on file, newest tax year first. */
export async function getTaxFilings(
  organizationId: string
): Promise<TaxFiling[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("heavy_vehicle_tax_filings")
    .select(
      "id, tax_year, filed_on, notes, trucks:heavy_vehicle_tax_filing_trucks (truck_id)"
    )
    .eq("organization_id", organizationId)
    .order("tax_year", { ascending: false })

  if (error) {
    throw error
  }
  return (
    data as unknown as (Omit<TaxFiling, "truck_ids"> & {
      trucks: { truck_id: string }[]
    })[]
  ).map(({ trucks, ...filing }) => ({
    ...filing,
    truck_ids: trucks.map((truck) => truck.truck_id),
  }))
}
