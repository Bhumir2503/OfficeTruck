import type { DriverDocumentKind } from "@/lib/driver-document-format"
import type { PayPeriod } from "@/lib/settlement-format"
import type { LoadStatus } from "@/lib/schemas/load"
import type {
  CdlClass,
  CdlEndorsement,
  DriverStatus,
  PayType,
} from "@/lib/schemas/driver"
import {
  type AssignmentDate,
  assignmentDates,
  missingDates,
} from "@/lib/assignment-compliance"
import { complianceItems, LAST_DELIVERY_DAYS, today } from "@/lib/driver-format"
import { getDqDatesByDriver } from "@/lib/dq/fleet"
import { cityState } from "@/lib/report-format"
import { createClient } from "@/lib/supabase/server"

export type Driver = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  /** Their first day, "YYYY-MM-DD"; the qualification file counts from it. */
  start_date: string | null
  /** Their last day, once they have left. */
  end_date: string | null
  /** Holds a medical variance, SPE certificate or exemption letter. */
  holds_medical_variance: boolean
  cdl_number: string | null
  cdl_state: string | null
  cdl_class: CdlClass | null
  cdl_endorsements: CdlEndorsement[]
  cdl_restrictions: string | null
  /** A calendar date, "YYYY-MM-DD". */
  cdl_expires_on: string | null
  /** The DOT medical card's expiration date. */
  medical_card_expires_on: string | null
  /** The medical examiner's National Registry number. */
  medical_examiner_registry_number: string | null
  medical_examiner_name: string | null
  /** When the medical exam was done. */
  medical_exam_on: string | null
  /** When their driving record was last reviewed; due again a year later. */
  last_annual_review_on: string | null
  /** When their limited Clearinghouse query was last run; due yearly. */
  last_clearinghouse_query_on: string | null
  /** Other states that licensed the driver in the past 3 years. */
  prior_license_states: string[]
  pay_type: PayType | null
  /** Dollars per mile, percent of the load, or dollars per load. */
  pay_rate: number | null
  /** How often they're paid; each pay statement covers one of these. */
  pay_period: PayPeriod
  status: DriverStatus
  notes: string | null
  created_at: string
  updated_at: string
}

const DRIVER_COLUMNS =
  "id, full_name, phone, email, start_date, end_date, holds_medical_variance, cdl_number, cdl_state, cdl_class, cdl_endorsements, cdl_restrictions, cdl_expires_on, medical_card_expires_on, medical_examiner_registry_number, medical_examiner_name, medical_exam_on, last_annual_review_on, last_clearinghouse_query_on, prior_license_states, pay_type, pay_rate, pay_period, status, notes, created_at, updated_at"

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
  /** CDL, medical card and yearly checks, to warn before they're assigned. */
  compliance: AssignmentDate[]
  /** A CDL expiration or medical card with no date on file. */
  missing: string[]
}

export async function getDriverOptions(
  organizationId: string
): Promise<DriverOption[]> {
  const supabase = await createClient()
  const [{ data, error }, dq] = await Promise.all([
    supabase
      .from("drivers")
      .select(
        "id, full_name, status, email, pay_type, pay_rate, cdl_expires_on, medical_card_expires_on"
      )
      .eq("organization_id", organizationId)
      .order("full_name"),
    getDqDatesByDriver(organizationId),
  ])

  if (error) {
    throw error
  }
  const now = today()
  return data.map(({ cdl_expires_on, medical_card_expires_on, ...driver }) => {
    const items = complianceItems(
      { cdl_expires_on, medical_card_expires_on },
      dq[driver.id],
      now
    )
    return {
      ...(driver as Omit<DriverOption, "compliance" | "missing">),
      compliance: assignmentDates(items),
      missing: missingDates(items),
    }
  })
}

export type DriverLoad = {
  id: string
  reference: string
  pickup_location: string
  delivery_location: string
  pickup_start: string
  delivery_start: string
  delivery_end: string | null
  /** The day it was really delivered, once it is. */
  delivered_on: string | null
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
      "id, reference, pickup_location, delivery_location, pickup_start, delivery_start, delivery_end, delivered_on, rate, miles, status, driver_pay_type, driver_pay_rate"
    )
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .order("pickup_start", { ascending: false })

  if (error) {
    throw error
  }
  return data as DriverLoad[]
}

/** A load on the drivers list's Now column. */
export type DriverNowLoad = {
  id: string
  reference: string
  /** "Dallas, TX" */
  from: string
  to: string
  status: "booked" | "dispatched" | "loaded"
  pickup_start: string
}

/** A driver's most recent delivered load, for the drivers list. */
export type DriverLastDelivery = {
  id: string
  reference: string
  /** "Gary, IN" */
  to: string
  /** The day it was delivered, "YYYY-MM-DD". */
  delivered_on: string
}

export type DriverNow = {
  current: DriverNowLoad | null
  next: DriverNowLoad | null
  last: DriverLastDelivery | null
}

// A load counts as delivered from here on in the flow.
const DELIVERED = ["delivered", "invoiced", "paid", "factored"] as const

/**
 * What each driver is doing, for the drivers list: the load they're on
 * (dispatched or in transit), the next one booked for them, and the last
 * one they delivered in the past LAST_DELIVERY_DAYS. Two queries for the
 * whole organization.
 */
export async function getDriversNow(
  organizationId: string,
  /** "YYYY-MM-DD" */
  today: string
): Promise<Record<string, DriverNow>> {
  return getLoadsNow(organizationId, today, "driver_id")
}

/**
 * The load each driver (or truck) is on, its next booked one and its last
 * delivery, keyed by the load column given. Shared by the drivers and
 * trucks lists.
 */
export async function getLoadsNow(
  organizationId: string,
  /** "YYYY-MM-DD" */
  today: string,
  by: "driver_id" | "truck_id"
): Promise<Record<string, DriverNow>> {
  const supabase = await createClient()
  // Only recent deliveries, so the list doesn't read the whole history.
  const since = new Date(`${today}T00:00:00Z`)
  since.setUTCDate(since.getUTCDate() - LAST_DELIVERY_DAYS)
  const [open, delivered] = await Promise.all([
    supabase
      .from("loads")
      .select(
        "id, driver_id, truck_id, reference, pickup_location, delivery_location, pickup_start, status"
      )
      .eq("organization_id", organizationId)
      .not(by, "is", null)
      .in("status", ["booked", "dispatched", "loaded"])
      .order("pickup_start", { ascending: true }),
    supabase
      .from("loads")
      .select(
        "id, driver_id, truck_id, reference, delivery_location, delivered_on"
      )
      .eq("organization_id", organizationId)
      .not(by, "is", null)
      .in("status", DELIVERED)
      .gte("delivered_on", since.toISOString().slice(0, 10)),
  ])

  if (open.error) {
    throw open.error
  }
  if (delivered.error) {
    throw delivered.error
  }
  const byDriver: Record<string, DriverNow> = {}
  const entryOf = (driverId: string) =>
    (byDriver[driverId] ??= { current: null, next: null, last: null })
  for (const row of delivered.data) {
    const entry = entryOf(row[by]!)
    // Set by the database on every delivered load.
    const on = row.delivered_on!
    if (!entry.last || on > entry.last.delivered_on) {
      entry.last = {
        id: row.id,
        reference: row.reference,
        to: cityState(row.delivery_location),
        delivered_on: on,
      }
    }
  }
  for (const row of open.data) {
    const load: DriverNowLoad = {
      id: row.id,
      reference: row.reference,
      from: cityState(row.pickup_location),
      to: cityState(row.delivery_location),
      status: row.status as DriverNowLoad["status"],
      pickup_start: row.pickup_start,
    }
    const entry = entryOf(row[by]!)
    // In transit beats dispatched; otherwise the earliest pickup wins.
    if (load.status !== "booked") {
      if (
        !entry.current ||
        (load.status === "loaded" && entry.current.status !== "loaded")
      ) {
        entry.current = load
      }
    } else if (!entry.next) {
      entry.next = load
    }
  }
  return byDriver
}

export type DriverDocument = {
  id: string
  kind: DriverDocumentKind
  title: string | null
  expires_on: string | null
  file_name: string
  content_type: string
  created_at: string
  /** A link that works for an hour, or null. */
  url: string | null
}

/** A driver's papers, by kind then newest first, with links to open them. */
export async function getDriverDocuments(
  organizationId: string,
  driverId: string
): Promise<DriverDocument[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("driver_documents")
    .select(
      "id, kind, title, expires_on, path, file_name, content_type, created_at"
    )
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .order("kind")
    .order("created_at", { ascending: false })
  if (error) {
    throw error
  }
  const urls = new Map<string, string>()
  if (data.length) {
    // The bucket is private, so links are signed and short-lived.
    const { data: signed } = await supabase.storage
      .from("driver-documents")
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
    kind: row.kind as DriverDocumentKind,
    url: urls.get(path) ?? null,
  }))
}

/** A new CDL or medical card the driver sent from the app, waiting for review. */
export type DriverUpdate = {
  id: string
  kind: "cdl" | "medical_card"
  /** As the driver read it off the card. */
  expires_on: string
  file_name: string
  content_type: string
  created_at: string
  /** A link that works for an hour, or null. */
  url: string | null
}

/** The driver's updates still waiting for an owner or admin, oldest first. */
export async function getDriverUpdates(
  organizationId: string,
  driverId: string
): Promise<DriverUpdate[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("driver_updates")
    .select("id, kind, expires_on, path, file_name, content_type, created_at")
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .eq("status", "pending")
    .order("created_at")
  if (error) {
    throw error
  }
  const urls = new Map<string, string>()
  if (data.length) {
    const { data: signed } = await supabase.storage
      .from("driver-documents")
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
    kind: row.kind as DriverUpdate["kind"],
    url: urls.get(path) ?? null,
  }))
}
