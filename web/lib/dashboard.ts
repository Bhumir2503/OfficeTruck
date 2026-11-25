import { cache } from "react"

import {
  buildAttention,
  countActions,
  type AttentionInput,
} from "@/lib/dashboard-format"
import { complianceItems, expiry, today as getToday } from "@/lib/driver-format"
import { getDqDatesByDriver } from "@/lib/dq/fleet"
import { getDrivers } from "@/lib/drivers"
import { COMPANY_DOCUMENT_LABELS } from "@/lib/company-document-format"
import { getCompanyDocuments } from "@/lib/documents"
import { getInvoices, getLoadsToInvoice } from "@/lib/invoices"
import { cityState } from "@/lib/report-format"
import type { AppointmentType, LoadStatus } from "@/lib/schemas/load"
import { createClient } from "@/lib/supabase/server"
import {
  truckComplianceItems,
  truckServiceItem,
  withEstimatedOdometer,
} from "@/lib/truck-format"
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
  const [invoices, ready, booked, drivers, trucks, papers, dq, lastService] =
    await Promise.all([
      getInvoices(organizationId),
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
      getTrucks(organizationId),
      getCompanyDocuments(organizationId),
      getDqDatesByDriver(organizationId),
      getLastServiceByTruck(organizationId),
    ])
  if (booked.error) {
    throw booked.error
  }

  const activeTrucks = trucks.filter((truck) => truck.status === "active")
  // Service by mileage counts from the odometer estimated from loads run
  // since the last reading.
  const milesSince = await getMilesSinceReading(organizationId, activeTrucks)
  const documents: AttentionInput["documents"] = [
    ...drivers
      .filter((driver) => driver.status === "active")
      .flatMap((driver) =>
        complianceItems(driver, dq[driver.id], today).map((item) => ({
          owner: driver.full_name,
          item,
          path: `drivers/${driver.id}`,
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
  const items = buildAttention({
    today,
    invoices,
    ready,
    booked: booked.data.map((load) => ({
      ...load,
      pickup_location: cityState(load.pickup_location),
    })),
    documents,
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
