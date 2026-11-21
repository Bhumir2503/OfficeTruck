import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { MaintenanceLogPrint } from "@/components/print/maintenance-log-print"
import { today } from "@/lib/driver-format"
import { getOrganization } from "@/lib/organizations"
import { truckDescription } from "@/lib/truck-format"
import { getTruck, getTruckMaintenance } from "@/lib/trucks"

export const metadata: Metadata = {
  title: "Maintenance record",
  robots: { index: false, follow: false },
}

/** A truck's maintenance record to print or save as a PDF, for audits. */
export default async function TruckMaintenancePrintPage({
  params,
}: PageProps<"/print/[slug]/trucks/[id]/maintenance">) {
  const { slug, id } = await params
  const organization = await getOrganization(slug)
  const truck = organization ? await getTruck(organization.id, id) : null
  if (!organization || !truck) {
    notFound()
  }
  const entries = await getTruckMaintenance(organization.id, truck.id)
  const facts = [
    ["Vehicle", truckDescription(truck)],
    ["VIN", truck.vin],
    [
      "Plate",
      truck.plate_number &&
        `${truck.plate_number}${truck.plate_state ? ` · ${truck.plate_state}` : ""}`,
    ],
    ["Unit", truck.unit_number],
  ].filter((fact): fact is [string, string] => !!fact[1])

  return (
    <MaintenanceLogPrint
      company={organization.name}
      title={truck.unit_number}
      facts={facts}
      entries={entries}
      printedOn={today()}
    />
  )
}
