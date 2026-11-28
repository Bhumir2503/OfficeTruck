import { cache } from "react"

import type { PayType } from "@/lib/schemas/driver"
import type { LoadStatus } from "@/lib/schemas/load"
import type {
  MaintenanceKind,
  Ownership,
  TruckStatus,
} from "@/lib/schemas/truck"
import {
  type AssignmentDate,
  assignmentDates,
} from "@/lib/assignment-compliance"
import { today } from "@/lib/driver-format"
import { type DriverNow, getLoadsNow } from "@/lib/drivers"
import { truckComplianceItems } from "@/lib/truck-format"
import type { TruckDocumentKind } from "@/lib/truck-document-format"
import { fetchAll } from "@/lib/supabase/paging"
import { createClient } from "@/lib/supabase/server"

/** The load a truck is on, its next booked one and its last delivery. */
export type TruckNow = DriverNow

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
  /** Where it starts when it has no earlier load, for empty miles. */
  home_base: string | null
  /** Dollars per month. */
  monthly_payment: number | null
  monthly_insurance: number | null
  monthly_other_costs: number | null
  /** Registered gross weight, in pounds. */
  registered_weight_lbs: number | null
  axles: number | null
  /** The last odometer reading, and the day it was read. */
  odometer: number | null
  odometer_on: string | null
  /** Preventive maintenance every so many miles and/or days. */
  pm_interval_miles: number | null
  pm_interval_days: number | null
  /** While out of service: why, and when it's expected back. */
  out_of_service_reason: string | null
  out_of_service_until: string | null
  /** When the annual DOT inspection was last done; due a year later. */
  annual_inspection_on: string | null
  registration_expires_on: string | null
  plate_expires_on: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

const TRUCK_COLUMNS =
  "id, unit_number, vin, year, make, model, plate_number, plate_state, status, ownership, default_driver_id, default_driver:drivers!trucks_default_driver_fkey (id, full_name), home_base, monthly_payment, monthly_insurance, monthly_other_costs, registered_weight_lbs, axles, odometer, odometer_on, pm_interval_miles, pm_interval_days, out_of_service_reason, out_of_service_until, annual_inspection_on, registration_expires_on, plate_expires_on, notes, created_at, updated_at"

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
export const getTruck = cache(async function getTruck(
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
})

/** A truck as listed in the load form's truck picker. */
export type TruckOption = {
  id: string
  unit_number: string
  status: TruckStatus
  default_driver_id: string | null
  /** Annual inspection, registration and plate, to warn before it's assigned. */
  compliance: AssignmentDate[]
}

export async function getTruckOptions(
  organizationId: string
): Promise<TruckOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trucks")
    .select(
      "id, unit_number, status, default_driver_id, annual_inspection_on, registration_expires_on, plate_expires_on"
    )
    .eq("organization_id", organizationId)
    .order("unit_number")

  if (error) {
    throw error
  }
  const now = today()
  return data.map(
    ({
      annual_inspection_on,
      registration_expires_on,
      plate_expires_on,
      ...truck
    }) => ({
      ...(truck as Omit<TruckOption, "compliance">),
      compliance: assignmentDates(
        truckComplianceItems(
          { annual_inspection_on, registration_expires_on, plate_expires_on },
          now
        )
      ),
    })
  )
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
  const data = await fetchAll((from, to) =>
    supabase
      .from("loads")
      .select(
        "id, reference, pickup_location, delivery_location, pickup_start, rate, miles, empty_miles, status, driver_pay_type, driver_pay_rate, tonu_driver_pay, driver:drivers!loads_driver_fkey (id, full_name, pay_type, pay_rate)"
      )
      .eq("organization_id", organizationId)
      .eq("truck_id", truckId)
      .order("pickup_start", { ascending: false })
      .order("id")
      .range(from, to)
  )
  return data as unknown as TruckLoad[]
}

/** What each truck is doing, for the trucks list, by truck id. */
export function getTrucksNow(
  organizationId: string,
  /** "YYYY-MM-DD" */
  today: string
): Promise<Record<string, TruckNow>> {
  return getLoadsNow(organizationId, today, "truck_id")
}

export type TruckDocument = {
  id: string
  kind: TruckDocumentKind
  title: string | null
  expires_on: string | null
  file_name: string
  content_type: string
  created_at: string
  /** A link that works for an hour, or null. */
  url: string | null
}

/** A truck's papers, by kind then newest first, with links to open them. */
export async function getTruckDocuments(
  organizationId: string,
  truckId: string
): Promise<TruckDocument[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("truck_documents")
    .select(
      "id, kind, title, expires_on, path, file_name, content_type, created_at"
    )
    .eq("organization_id", organizationId)
    .eq("truck_id", truckId)
    .order("kind")
    .order("created_at", { ascending: false })
  if (error) {
    throw error
  }
  const urls = new Map<string, string>()
  if (data.length) {
    // The bucket is private, so links are signed and short-lived.
    const { data: signed } = await supabase.storage
      .from("truck-documents")
      .createSignedUrls(
        data.map((row) => row.path),
        60 * 60
      )
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) {
        urls.set(item.path, item.signedUrl)
      }
    }
  }
  return data.map(({ path, ...row }) => ({
    ...row,
    kind: row.kind as TruckDocumentKind,
    url: urls.get(path) ?? null,
  }))
}

export type TruckMaintenance = {
  id: string
  done_on: string
  kind: MaintenanceKind
  description: string
  odometer: number | null
  cost: number | null
  vendor: string | null
  /** The shop's receipt or invoice, with a link that works for an hour. */
  receipt: { name: string; type: string; url: string | null } | null
}

/** A truck's maintenance log, newest first. */
export async function getTruckMaintenance(
  organizationId: string,
  truckId: string
): Promise<TruckMaintenance[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("truck_maintenance")
    .select(
      "id, done_on, kind, description, odometer, cost, vendor, receipt_path, receipt_name, receipt_type"
    )
    .eq("organization_id", organizationId)
    .eq("truck_id", truckId)
    .order("done_on", { ascending: false })
    .order("created_at", { ascending: false })
  if (error) {
    throw error
  }
  type Row = Omit<TruckMaintenance, "receipt"> & {
    receipt_path: string | null
    receipt_name: string | null
    receipt_type: string | null
  }
  const rows = data as Row[]
  const urls = new Map<string, string>()
  const paths = rows.flatMap((row) =>
    row.receipt_path ? [row.receipt_path] : []
  )
  if (paths.length) {
    // The bucket is private, so links are signed and short-lived.
    const { data: signed } = await supabase.storage
      .from("truck-documents")
      .createSignedUrls(paths, 60 * 60)
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl)
    }
  }
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

export type LastService = { done_on: string; odometer: number | null }

/**
 * Each truck's most recent preventive service, by truck id, for maintenance
 * reminders on the trucks list, dashboard and Compliance page.
 */
export async function getLastServiceByTruck(
  organizationId: string
): Promise<Record<string, LastService>> {
  const supabase = await createClient()
  const data = await fetchAll((from, to) =>
    supabase
      .from("truck_maintenance")
      .select("truck_id, done_on, odometer")
      .eq("organization_id", organizationId)
      .eq("kind", "preventive")
      .order("done_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
  )
  const byTruck: Record<string, LastService> = {}
  for (const row of data as (LastService & { truck_id: string })[]) {
    // Newest first, so the first one seen for a truck is its last service.
    byTruck[row.truck_id] ??= { done_on: row.done_on, odometer: row.odometer }
  }
  return byTruck
}

/** Load miles a truck has run since its last odometer reading. */
export type MilesSinceReading = { miles: number; loads: number }

// A load counts as run once it's delivered, from here on in the flow.
const RUN = ["delivered", "invoiced", "paid", "factored"]

/**
 * For each truck with an odometer reading, the loaded and empty miles of the
 * loads it delivered after the day of that reading, to estimate where its
 * odometer is now. Loads delivered the same day are left out: the driver's
 * reading at the last stop already counts that trip.
 */
export async function getMilesSinceReading(
  organizationId: string,
  trucks: Pick<Truck, "id" | "odometer" | "odometer_on">[]
): Promise<Record<string, MilesSinceReading>> {
  const read = trucks.filter(
    (truck) => truck.odometer !== null && truck.odometer_on !== null
  )
  if (!read.length) return {}
  const since = read.map((truck) => truck.odometer_on!).sort()[0]
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("loads")
    .select("id, truck_id, miles, empty_miles, delivered_on")
    .eq("organization_id", organizationId)
    .in(
      "truck_id",
      read.map((truck) => truck.id)
    )
    .in("status", RUN)
    // The day each load really finished: one that already ran (and whose
    // odometer may be the reading itself) mustn't be counted on top of it.
    .gt("delivered_on", since)
  if (error) {
    throw error
  }
  const rows = data as {
    id: string
    truck_id: string
    miles: number | null
    empty_miles: number | null
    delivered_on: string
  }[]

  const readOn = new Map(read.map((truck) => [truck.id, truck.odometer_on!]))
  const byTruck: Record<string, MilesSinceReading> = {}
  for (const row of rows) {
    if (row.delivered_on <= readOn.get(row.truck_id)!) continue
    const entry = (byTruck[row.truck_id] ??= { miles: 0, loads: 0 })
    entry.miles += (row.miles ?? 0) + (row.empty_miles ?? 0)
    entry.loads += 1
  }
  return byTruck
}
