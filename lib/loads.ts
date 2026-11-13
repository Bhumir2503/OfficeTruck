import { createClient } from "@/lib/supabase/server"
import type { PayType } from "@/lib/schemas/driver"
import type {
  ChargeKind,
  EquipmentType,
  LoadStatus,
  StopKind,
} from "@/lib/schemas/load"

export type Load = {
  id: string
  reference: string
  broker_name: string
  broker_id: string | null
  broker: {
    id: string
    legal_name: string
    email_domains: string[]
    phone: string | null
  } | null
  /** Who sent the rate con, for the impersonation check. */
  rate_con_from: string | null
  pickup_location: string
  /** Wall-clock time at the stop, "YYYY-MM-DDTHH:mm:ss" with no zone. */
  pickup_start: string
  pickup_end: string | null
  delivery_location: string
  delivery_start: string
  delivery_end: string | null
  /** The total of the load's charges. */
  rate: number
  status: LoadStatus
  /** Typed in before drivers existed; shown when there's no linked driver. */
  driver_name: string | null
  driver_id: string | null
  driver: {
    id: string
    full_name: string
    pay_type: PayType | null
    pay_rate: number | null
  } | null
  miles: number | null
  /** The driver's pay rate, locked onto the load when they were assigned. */
  driver_pay_type: PayType | null
  driver_pay_rate: number | null
  /** Typed in before trucks existed; shown when there's no linked truck. */
  truck: string | null
  truck_id: string | null
  truck_link: { id: string; unit_number: string } | null
  /** Deadhead miles to get to the pickup. */
  empty_miles: number | null
  /** PO, order or other numbers the shipper or receiver goes by. */
  reference_numbers: string | null
  equipment: EquipmentType | null
  commodity: string | null
  weight_lbs: number | null
  trailer_number: string | null
  /** Detention terms from the rate con. Both or neither. */
  detention_free_hours: number | null
  detention_rate: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

const LOAD_COLUMNS =
  "id, reference, broker_name, broker_id, broker:brokers!loads_broker_fkey (id, legal_name, email_domains, phone), rate_con_from, pickup_location, pickup_start, pickup_end, delivery_location, delivery_start, delivery_end, rate, status, driver_name, driver_id, driver:drivers!loads_driver_fkey (id, full_name, pay_type, pay_rate), miles, driver_pay_type, driver_pay_rate, empty_miles, truck, truck_id, truck_link:trucks!loads_truck_fkey (id, unit_number), reference_numbers, equipment, commodity, weight_lbs, trailer_number, detention_free_hours, detention_rate, notes, created_at, updated_at"

/** Every load in the organization, newest pickup first. */
export async function getLoads(organizationId: string): Promise<Load[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("loads")
    .select(LOAD_COLUMNS)
    .eq("organization_id", organizationId)
    .order("pickup_start", { ascending: false })

  if (error) {
    throw error
  }
  return data as unknown as Load[]
}

/** One load, or null if it isn't in this organization. */
export async function getLoad(
  organizationId: string,
  id: string
): Promise<Load | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("loads")
    .select(LOAD_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    // An id that isn't a UUID is just a load that doesn't exist.
    if (error.code === "22P02") {
      return null
    }
    throw error
  }
  return data as unknown as Load | null
}

export type LoadStop = {
  id: string
  position: number
  kind: StopKind
  location: string
  /** Wall-clock time at the stop, "YYYY-MM-DDTHH:mm:ss" with no zone. */
  appointment_start: string
  appointment_end: string | null
  stop_number: string | null
  notes: string | null
  /** Server time when the driver tapped arrived and departed. */
  arrived_at: string | null
  departed_at: string | null
}

export type LoadCharge = {
  id: string
  kind: ChargeKind
  description: string | null
  amount: number
  /** rate_con: agreed on the rate con. accessorial: added after booking. */
  source: "rate_con" | "accessorial"
  created_at: string
}

export type RateVersion = {
  id: string
  version: number
  status: "pending" | "approved" | "rejected"
  /** manual: typed in by a person. rate_con: read from a rate con by the app. */
  source: "manual" | "rate_con"
  charges: { kind: ChargeKind; description: string | null; amount: number }[]
  total: number
  detention_free_hours: number | null
  detention_rate: number | null
  note: string | null
  created_at: string
  reviewed_at: string | null
}

/** A load with its stops, charges and rate versions, for the load page. */
export async function getLoadDetail(organizationId: string, id: string) {
  const load = await getLoad(organizationId, id)
  if (!load) {
    return null
  }
  const supabase = await createClient()
  const [stops, charges, versions] = await Promise.all([
    supabase
      .from("load_stops")
      .select(
        "id, position, kind, location, appointment_start, appointment_end, stop_number, notes, arrived_at, departed_at"
      )
      .eq("load_id", id)
      .order("position"),
    supabase
      .from("load_charges")
      .select("id, kind, description, amount, source, created_at")
      .eq("load_id", id)
      .order("source", { ascending: false })
      .order("position")
      .order("created_at"),
    supabase
      .from("load_rate_versions")
      .select(
        "id, version, status, source, charges, total, detention_free_hours, detention_rate, note, created_at, reviewed_at"
      )
      .eq("load_id", id)
      .order("version", { ascending: false }),
  ])
  for (const result of [stops, charges, versions]) {
    if (result.error) {
      throw result.error
    }
  }
  return {
    load,
    stops: stops.data as unknown as LoadStop[],
    charges: charges.data as unknown as LoadCharge[],
    versions: versions.data as unknown as RateVersion[],
  }
}
