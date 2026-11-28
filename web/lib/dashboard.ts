import { cache } from "react"

import {
  buildAttention,
  countActions,
  type AttentionInput,
} from "@/lib/dashboard-format"
import { complianceItems, expiry, today as getToday } from "@/lib/driver-format"
import { getDqDatesByDriver } from "@/lib/dq/fleet"
import { getDrivers } from "@/lib/drivers"
import { getIftaReminder } from "@/lib/ifta"
import {
  dueDate,
  previousQuarter,
  quarterKey,
  quarterLabel,
  quarterOf,
} from "@/lib/ifta-format"
import { COMPANY_DOCUMENT_LABELS } from "@/lib/company-document-format"
import { getCompanyDocuments } from "@/lib/documents"
import { getLoadsToInvoice, getOpenInvoices } from "@/lib/invoices"
import { cityState } from "@/lib/report-format"
import type { AppointmentType, LoadStatus } from "@/lib/schemas/load"
import { createClient } from "@/lib/supabase/server"
import {
  truckComplianceItems,
  truckServiceItem,
  withEstimatedOdometer,
} from "@/lib/truck-format"
import { getTrailers } from "@/lib/trailers"
import {
  getLastServiceByTruck,
  getMilesSinceReading,
  getTrucks,
} from "@/lib/trucks"

/**
 * Everything the owner should act on, most pressing first. Cached for the
 * request, so the sidebar badge and the dashboard share one set of queries.
 */
export const getAttention = cache(async (organizationId: string) => {
  const today = getToday()
  const supabase = await createClient()
  // The IFTA return still to file: the quarter just ended.
  const iftaQuarter = previousQuarter(quarterOf(today))
  const [
    invoices,
    ready,
    booked,
    drivers,
    { trucks, milesSince },
    trailers,
    papers,
    dq,
    lastService,
    ifta,
    onSchedule,
    updates,
  ] = await Promise.all([
    getOpenInvoices(organizationId),
    getLoadsToInvoice(organizationId),
    supabase
      .from("loads")
      .select(
        "id, reference, pickup_location, pickup_start, driver_id, truck_id"
      )
      .eq("organization_id", organizationId)
      .eq("status", "booked")
      .order("pickup_start"),
    getDrivers(organizationId),
    // With the miles each has run since its odometer reading, for service
    // due by mileage: started as soon as the trucks are in.
    getTrucks(organizationId).then(async (trucks) => {
      const active = trucks.filter((truck) => truck.status === "active")
      return {
        trucks,
        milesSince: await getMilesSinceReading(organizationId, active),
      }
    }),
    getTrailers(organizationId),
    getCompanyDocuments(organizationId, false),
    getDqDatesByDriver(organizationId),
    getLastServiceByTruck(organizationId),
    getIftaReminder(organizationId, iftaQuarter),
    // Loads on a driver's schedule: for documents they can't drive without,
    // and dispatched ones that never picked up.
    supabase
      .from("loads")
      .select(
        "id, reference, status, pickup_location, pickup_start, driver_id, truck_id, driver:drivers!loads_driver_fkey (full_name)"
      )
      .eq("organization_id", organizationId)
      .in("status", ["booked", "dispatched", "loaded"])
      .order("pickup_start"),
    supabase
      .from("driver_updates")
      .select("id, driver_id, kind, created_at")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .order("created_at"),
  ])
  if (booked.error) {
    throw booked.error
  }
  if (onSchedule.error) {
    throw onSchedule.error
  }
  if (updates.error) {
    throw updates.error
  }
  const scheduled = onSchedule.data as unknown as {
    id: string
    reference: string
    status: string
    pickup_location: string
    pickup_start: string
    driver_id: string | null
    truck_id: string | null
    driver: { full_name: string } | null
  }[]
  // Each driver's and truck's nearest load: on the road first, then the
  // next booked.
  type Scheduled = { reference: string; pickup_start: string }
  const loadOf = new Map<string, Scheduled>()
  const truckLoadOf = new Map<string, Scheduled>()
  for (const load of [
    ...scheduled.filter((load) => load.status !== "booked"),
    ...scheduled.filter((load) => load.status === "booked"),
  ]) {
    const entry = { reference: load.reference, pickup_start: load.pickup_start }
    if (load.driver_id && !loadOf.has(load.driver_id)) {
      loadOf.set(load.driver_id, entry)
    }
    if (load.truck_id && !truckLoadOf.has(load.truck_id)) {
      truckLoadOf.set(load.truck_id, entry)
    }
  }
  const driverName = new Map(
    drivers.map((driver) => [driver.id, driver.full_name])
  )

  const activeTrucks = trucks.filter((truck) => truck.status === "active")
  // Service by mileage counts from the odometer estimated from loads run
  // since the last reading.
  const documents: AttentionInput["documents"] = [
    ...drivers
      .filter((driver) => driver.status === "active")
      .flatMap((driver) =>
        complianceItems(driver, dq[driver.id], today).map((item) => ({
          owner: driver.full_name,
          item,
          path: `drivers/${driver.id}`,
          onLoad: loadOf.get(driver.id) ?? null,
        }))
      ),
    ...activeTrucks.flatMap((truck) =>
      [
        ...truckComplianceItems(truck, today),
        truckServiceItem(
          withEstimatedOdometer(truck, milesSince[truck.id]),
          lastService[truck.id],
          today
        ),
      ]
        .filter((item) => item !== null)
        .map((item) => ({
          owner: `Truck ${truck.unit_number}`,
          item,
          path: `equipment/${truck.id}`,
          onLoad: truckLoadOf.get(truck.id) ?? null,
        }))
    ),
    // Trailers have the same three dates as trucks.
    ...trailers
      .filter((trailer) => trailer.status === "active")
      .flatMap((trailer) =>
        truckComplianceItems(trailer, today).map((item) => ({
          owner: `Trailer ${trailer.unit_number}`,
          item,
          path: `trailers/${trailer.id}`,
        }))
      ),
  ]
  // A truck parked past the day it was due back from out of service.
  for (const truck of trucks) {
    const until = truck.out_of_service_until
    if (truck.status !== "out_of_service" || !until || until >= today) {
      continue
    }
    documents.push({
      owner: `Truck ${truck.unit_number}`,
      item: {
        key: "back_in_service",
        label: "Return to service",
        kind: "due",
        due: until,
        expiry: expiry(until, today),
      },
      path: `equipment/${truck.id}`,
    })
  }
  // The company's own papers that run out.
  for (const paper of papers) {
    if (!paper.expires_on) continue
    documents.push({
      owner: "Company",
      item: {
        key: `company_document_${paper.id}`,
        label: paper.title ?? COMPANY_DOCUMENT_LABELS[paper.kind],
        kind: "expires",
        due: paper.expires_on,
        expiry: expiry(paper.expires_on, today),
      },
      path: "documents",
    })
  }
  // The IFTA return, for companies that keep IFTA here, until it's marked
  // filed. Like other dates, it shows from 30 days before it's due.
  if (ifta.inUse && !ifta.filed) {
    const due = dueDate(iftaQuarter)
    documents.push({
      owner: "Company",
      item: {
        key: "ifta_return",
        label: `IFTA return for ${quarterLabel(iftaQuarter)}`,
        kind: "due",
        due,
        expiry: expiry(due, today),
      },
      path: `ifta?q=${quarterKey(iftaQuarter)}`,
    })
  }
  const items = buildAttention({
    today,
    invoices,
    ready,
    booked: booked.data.map((load) => ({
      ...load,
      pickup_location: cityState(load.pickup_location),
    })),
    documents,
    driverUpdates: (
      updates.data as {
        id: string
        driver_id: string
        kind: string
        created_at: string
      }[]
    ).map((update) => ({
      id: update.id,
      driver: driverName.get(update.driver_id) ?? "A driver",
      kind: update.kind,
      path: `drivers/${update.driver_id}`,
      submitted_at: update.created_at,
    })),
    dispatched: scheduled
      .filter((load) => load.status === "dispatched" && load.driver_id)
      .map((load) => ({
        id: load.id,
        reference: load.reference,
        pickup_location: cityState(load.pickup_location),
        pickup_start: load.pickup_start,
        driver: load.driver?.full_name ?? null,
      })),
  })
  return { today, items, invoices }
})

/** The counts on the dashboard's cards and the sidebar badge. */
export async function getActionCounts(organizationId: string) {
  return countActions((await getAttention(organizationId)).items)
}

/** A load that's out on the road, or about to be. */
export type MovingLoad = {
  id: string
  reference: string
  status: LoadStatus
  pickup_location: string
  pickup_start: string
  pickup_appointment_type: AppointmentType
  delivery_location: string
  delivery_start: string
  delivery_appointment_type: AppointmentType
  driver_name: string | null
  driver: { full_name: string } | null
  truck: string | null
  truck_link: { unit_number: string } | null
}

/**
 * Loads dispatched or in transit, then booked loads picking up within the
 * next two days, each by the time of the stop they're heading to.
 */
export async function getMovingLoads(
  organizationId: string,
  today: string
): Promise<MovingLoad[]> {
  const supabase = await createClient()
  const soon = new Date(`${today}T00:00:00Z`)
  soon.setUTCDate(soon.getUTCDate() + 2)
  const { data, error } = await supabase
    .from("loads")
    .select(
      "id, reference, status, pickup_location, pickup_start, pickup_appointment_type, delivery_location, delivery_start, delivery_appointment_type, driver_name, driver:drivers!loads_driver_fkey (full_name), truck, truck_link:trucks!loads_truck_fkey (unit_number)"
    )
    .eq("organization_id", organizationId)
    .in("status", ["booked", "dispatched", "loaded"])
    .order("pickup_start")
  if (error) {
    throw error
  }
  const until = `${soon.toISOString().slice(0, 10)}T23:59:59`
  const loads = (data as unknown as MovingLoad[]).filter(
    (load) => load.status !== "booked" || load.pickup_start <= until
  )
  const next = (load: MovingLoad) =>
    load.status === "loaded" ? load.delivery_start : load.pickup_start
  const rank = { loaded: 0, dispatched: 1, booked: 2 } as Record<string, number>
  return loads.sort(
    (a, b) => rank[a.status] - rank[b.status] || next(a).localeCompare(next(b))
  )
}

/** A driver at a stop now, on a load with free time on it. */
export type WaitingStop = {
  id: string
  position: number
  kind: "pickup" | "delivery"
  facility: string | null
  location: string
  arrived_at: string
  departed_at: null
  appointment_at: string | null
  load: {
    id: string
    reference: string
    detention_free_hours: number
    detention_rate: number | null
    driver_name: string | null
  }
}

/**
 * Drivers checked in at a stop and not out yet, on loads with detention
 * terms: the ones whose free time is running. Longest wait first. Arrivals
 * more than a day old are left out (a check-out nobody entered).
 */
export async function getWaitingStops(
  organizationId: string
): Promise<WaitingStop[]> {
  const supabase = await createClient()
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString()
  const { data: stops, error } = await supabase
    .from("load_stops")
    .select(
      "id, load_id, position, kind, facility, location, arrived_at, appointment_at"
    )
    .eq("organization_id", organizationId)
    .not("arrived_at", "is", null)
    .is("departed_at", null)
    .gt("arrived_at", since)
    .order("arrived_at")
  if (error) throw error
  if (!stops.length) return []
  const { data: loads, error: loadsError } = await supabase
    .from("loads")
    .select(
      "id, reference, status, detention_free_hours, detention_rate, driver_name, driver:drivers!loads_driver_fkey (full_name)"
    )
    .eq("organization_id", organizationId)
    .in(
      "id",
      stops.map((stop) => stop.load_id)
    )
    .in("status", ["dispatched", "loaded"])
    .not("detention_free_hours", "is", null)
  if (loadsError) throw loadsError
  const byId = new Map(loads.map((load) => [load.id, load]))
  return stops.flatMap((stop) => {
    const load = byId.get(stop.load_id)
    if (!load) return []
    const driver = load.driver as unknown as { full_name: string } | null
    return [
      {
        id: stop.id,
        position: stop.position,
        kind: stop.kind,
        facility: stop.facility,
        location: stop.location,
        arrived_at: stop.arrived_at as string,
        departed_at: null,
        appointment_at: (stop.appointment_at as string | null) ?? null,
        load: {
          id: load.id,
          reference: load.reference,
          detention_free_hours: Number(load.detention_free_hours),
          detention_rate:
            load.detention_rate === null ? null : Number(load.detention_rate),
          driver_name: driver?.full_name ?? load.driver_name,
        },
      },
    ]
  })
}
