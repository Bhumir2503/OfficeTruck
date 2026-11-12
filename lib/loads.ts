import { createClient } from "@/lib/supabase/server"
import type { LoadStatus } from "@/lib/schemas/load"

export type Load = {
  id: string
  reference: string
  broker_name: string
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
  driver_name: string | null
  truck: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

const LOAD_COLUMNS =
  "id, reference, broker_name, pickup_location, pickup_start, pickup_end, delivery_location, delivery_start, delivery_end, rate, status, driver_name, truck, notes, created_at, updated_at"

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
  return data as Load[]
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
  return data as Load | null
}
