import { createClient } from "@/lib/supabase/server"
import type { PayType } from "@/lib/schemas/driver"
import type { LoadStatus } from "@/lib/schemas/load"

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
  /** Postgres numeric comes back as a number for numeric(10, 2). */
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
  /** Typed in before trucks existed; shown when there's no linked truck. */
  truck: string | null
  truck_id: string | null
  truck_link: { id: string; unit_number: string } | null
  /** Deadhead miles to get to the pickup. */
  empty_miles: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

const LOAD_COLUMNS =
  "id, reference, broker_name, broker_id, broker:brokers!loads_broker_fkey (id, legal_name, email_domains, phone), rate_con_from, pickup_location, pickup_start, pickup_end, delivery_location, delivery_start, delivery_end, rate, status, driver_name, driver_id, driver:drivers!loads_driver_fkey (id, full_name, pay_type, pay_rate), miles, empty_miles, truck, truck_id, truck_link:trucks!loads_truck_fkey (id, unit_number), notes, created_at, updated_at"

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
