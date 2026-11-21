import type { Ownership, TruckStatus } from "@/lib/schemas/truck"
import type { TrailerType } from "@/lib/schemas/trailer"
import { createClient } from "@/lib/supabase/server"
import type { TrailerDocumentKind } from "@/lib/trailer-document-format"
import type { TruckMaintenance } from "@/lib/trucks"

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

/** A trailer's maintenance log, newest first, with links to receipts. */
export async function getTrailerMaintenance(
  organizationId: string,
  trailerId: string
): Promise<TruckMaintenance[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trailer_maintenance")
    .select(
      "id, done_on, kind, description, odometer, cost, vendor, receipt_path, receipt_name, receipt_type"
    )
    .eq("organization_id", organizationId)
    .eq("trailer_id", trailerId)
    .order("done_on", { ascending: false })
    .order("created_at", { ascending: false })
  if (error) {
    throw error
  }
  const rows = data as (Omit<TruckMaintenance, "receipt"> & {
    receipt_path: string | null
    receipt_name: string | null
    receipt_type: string | null
  })[]
  const urls = await signedUrls(
    rows.flatMap((row) => (row.receipt_path ? [row.receipt_path] : []))
  )
  return rows.map(({ receipt_path, receipt_name, receipt_type, ...row }) => ({
    ...row,
    cost: row.cost === null ? null : Number(row.cost),
    receipt:
      receipt_path && receipt_name && receipt_type
        ? {
            name: receipt_name,
            type: receipt_type,
            url: urls.get(receipt_path) ?? null,
          }
        : null,
  }))
}

export type TrailerDocument = {
  id: string
  kind: TrailerDocumentKind
  title: string | null
  expires_on: string | null
  file_name: string
  content_type: string
  created_at: string
  /** A link that works for an hour, or null. */
  url: string | null
}

/** A trailer's papers, by kind then newest first, with links to open them. */
export async function getTrailerDocuments(
  organizationId: string,
  trailerId: string
): Promise<TrailerDocument[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trailer_documents")
    .select(
      "id, kind, title, expires_on, path, file_name, content_type, created_at"
    )
    .eq("organization_id", organizationId)
    .eq("trailer_id", trailerId)
    .order("kind")
    .order("created_at", { ascending: false })
  if (error) {
    throw error
  }
  const urls = await signedUrls(data.map((row) => row.path))
  return data.map(({ path, ...row }) => ({
    ...row,
    kind: row.kind as TrailerDocumentKind,
    url: urls.get(path) ?? null,
  }))
}

/** Hour-long links to files in the private truck-documents bucket, by path. */
async function signedUrls(paths: string[]) {
  const urls = new Map<string, string>()
  if (!paths.length) return urls
  const supabase = await createClient()
  const { data } = await supabase.storage
    .from("truck-documents")
    .createSignedUrls(paths, 60 * 60)
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl)
  }
  return urls
}
