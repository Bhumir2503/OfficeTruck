import type { LoadStatus } from "@/lib/schemas/load"
import type { DriverStatus, PayType } from "@/lib/schemas/driver"
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
  /** When the yearly driving record review was last done; due a year later. */
  annual_review_on: string | null
  /** When the yearly Clearinghouse query was last run; due a year later. */
  clearinghouse_query_on: string | null
  pay_type: PayType | null
  /** Dollars per mile, percent of the load, or dollars per load. */
  pay_rate: number | null
  /** Paths in the driver-documents bucket. */
  cdl_photo_path: string | null
  medical_card_photo_path: string | null
  status: DriverStatus
  notes: string | null
  created_at: string
  updated_at: string
}

const DRIVER_COLUMNS =
  "id, full_name, phone, email, cdl_number, cdl_state, cdl_expires_on, medical_card_expires_on, annual_review_on, clearinghouse_query_on, pay_type, pay_rate, cdl_photo_path, medical_card_photo_path, status, notes, created_at, updated_at"

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

/** A driver as listed in the load form's driver picker. */
export type DriverOption = {
  id: string
  full_name: string
  status: DriverStatus
  email: string | null
  /** Their rate today, which is locked onto a load when they're assigned. */
  pay_type: PayType | null
  pay_rate: number | null
}

export async function getDriverOptions(
  organizationId: string
): Promise<DriverOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("drivers")
    .select("id, full_name, status, email, pay_type, pay_rate")
    .eq("organization_id", organizationId)
    .order("full_name")

  if (error) {
    throw error
  }
  return data as DriverOption[]
}

export type DriverLoad = {
  id: string
  reference: string
  pickup_location: string
  delivery_location: string
  pickup_start: string
  delivery_start: string
  delivery_end: string | null
  rate: number
  miles: number | null
  status: LoadStatus
  /** The pay rate locked onto the load when this driver was assigned. */
  driver_pay_type: PayType | null
  driver_pay_rate: number | null
}

/** The loads a driver has been assigned, newest pickup first. */
export async function getDriverLoads(
  organizationId: string,
  driverId: string
): Promise<DriverLoad[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("loads")
    .select(
      "id, reference, pickup_location, delivery_location, pickup_start, delivery_start, delivery_end, rate, miles, status, driver_pay_type, driver_pay_rate"
    )
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .order("pickup_start", { ascending: false })

  if (error) {
    throw error
  }
  return data as DriverLoad[]
}

export type DriverPhotoKind = "cdl" | "medical_card"

/**
 * Short-lived links to a driver's CDL and medical card photos, since the
 * bucket is private. A missing or unreadable file comes back as null.
 */
export async function getDriverPhotoUrls(
  driver: Driver
): Promise<Record<DriverPhotoKind, string | null>> {
  const paths = [driver.cdl_photo_path, driver.medical_card_photo_path].filter(
    (path): path is string => !!path
  )
  const urls = new Map<string, string>()
  if (paths.length) {
    const supabase = await createClient()
    const { data } = await supabase.storage
      .from("driver-documents")
      .createSignedUrls(paths, 60 * 60)
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) {
        urls.set(item.path, item.signedUrl)
      }
    }
  }
  const url = (path: string | null) => (path ? (urls.get(path) ?? null) : null)
  return {
    cdl: url(driver.cdl_photo_path),
    medical_card: url(driver.medical_card_photo_path),
  }
}
