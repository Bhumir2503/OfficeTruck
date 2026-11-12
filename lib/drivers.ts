import type { DriverStatus } from "@/lib/schemas/driver"
import { createClient } from "@/lib/supabase/server"

export type Driver = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  cdl_number: string | null
  cdl_state: string | null
  /** A calendar date, "YYYY-MM-DD". */
  cdl_expires_on: string | null
  medical_card_expires_on: string | null
  status: DriverStatus
  notes: string | null
  created_at: string
  updated_at: string
}

const DRIVER_COLUMNS =
  "id, full_name, phone, email, cdl_number, cdl_state, cdl_expires_on, medical_card_expires_on, status, notes, created_at, updated_at"

/** Every driver in the organization, by name. */
export async function getDrivers(organizationId: string): Promise<Driver[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("drivers")
    .select(DRIVER_COLUMNS)
    .eq("organization_id", organizationId)
    .order("full_name")

  if (error) {
    throw error
  }
  return data as Driver[]
}

/** One driver, or null if they aren't in this organization. */
export async function getDriver(
  organizationId: string,
  id: string
): Promise<Driver | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("drivers")
    .select(DRIVER_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    // An id that isn't a UUID is just a driver that doesn't exist.
    if (error.code === "22P02") {
      return null
    }
    throw error
  }
  return data as Driver | null
}
