import type { Ownership, TruckStatus } from "@/lib/schemas/truck"
import type { TrailerType } from "@/lib/schemas/trailer"
import { createClient } from "@/lib/supabase/server"

export type Trailer = {
  id: string
  unit_number: string
  trailer_type: TrailerType | null
  length_ft: number | null
  vin: string | null
  year: number | null
  make: string | null
  plate_number: string | null
  plate_state: string | null
  /** Same statuses as trucks. */
  status: TruckStatus
  ownership: Ownership | null
  truck_id: string | null
  /** The truck pulling it now. */
  truck: { id: string; unit_number: string } | null
  /** When the annual inspection was last done; due a year later. */
  annual_inspection_on: string | null
  registration_expires_on: string | null
  plate_expires_on: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

const TRAILER_COLUMNS =
  "id, unit_number, trailer_type, length_ft, vin, year, make, plate_number, plate_state, status, ownership, truck_id, truck:trucks!trailers_truck_fkey (id, unit_number), annual_inspection_on, registration_expires_on, plate_expires_on, notes, created_at, updated_at"

/** Every trailer in the organization, by unit number. */
export async function getTrailers(organizationId: string): Promise<Trailer[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trailers")
    .select(TRAILER_COLUMNS)
    .eq("organization_id", organizationId)
    .order("unit_number")
  if (error) {
    throw error
  }
  return data as unknown as Trailer[]
}

/** One trailer, or null if it isn't in this organization. */
export async function getTrailer(
  organizationId: string,
  id: string
): Promise<Trailer | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trailers")
    .select(TRAILER_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle()
  if (error) {
    // An id that isn't a UUID is just a trailer that doesn't exist.
    if (error.code === "22P02") {
      return null
    }
    throw error
  }
  return data as unknown as Trailer | null
}
