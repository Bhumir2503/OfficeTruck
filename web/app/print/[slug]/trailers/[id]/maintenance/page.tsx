import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { MaintenanceLogPrint } from "@/components/print/maintenance-log-print"
import { today } from "@/lib/driver-format"
import { getOrganization } from "@/lib/organizations"
import { trailerDescription } from "@/lib/trailer-format"
import { getTrailer, getTrailerMaintenance } from "@/lib/trailers"

export const metadata: Metadata = {
  title: "Maintenance record",
  robots: { index: false, follow: false },
}

/** A trailer's maintenance record to print or save as a PDF, for audits. */
export default async function TrailerMaintenancePrintPage({
  params,
}: PageProps<"/print/[slug]/trailers/[id]/maintenance">) {
  const { slug, id } = await params
  const organization = await getOrganization(slug)
  const trailer = organization ? await getTrailer(organization.id, id) : null
  if (!organization || !trailer) {
    notFound()
  }
  const entries = await getTrailerMaintenance(organization.id, trailer.id)
  const facts = [
    ["Trailer", trailerDescription(trailer)],
    ["VIN", trailer.vin],
    [
      "Plate",
      trailer.plate_number &&
        `${trailer.plate_number}${trailer.plate_state ? ` · ${trailer.plate_state}` : ""}`,
    ],
    ["Unit", trailer.unit_number],
  ].filter((fact): fact is [string, string] => !!fact[1])

  return (
    <MaintenanceLogPrint
      company={organization.name}
      title={trailer.unit_number}
      facts={facts}
      entries={entries}
      printedOn={today()}
    />
  )
}
