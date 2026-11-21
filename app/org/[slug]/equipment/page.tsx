import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { TrucksTable } from "@/components/trucks/trucks-table"
import { today } from "@/lib/driver-format"
import { canManage, getOrganization } from "@/lib/organizations"
import {
  getLastServiceByTruck,
  getTaxFilings,
  getTrucks,
  getTrucksNow,
} from "@/lib/trucks"

export const metadata: Metadata = { title: "Trucks" }

export default async function TrucksPage({
  params,
}: PageProps<"/org/[slug]/equipment">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const [trucks, filings, now, lastService] = await Promise.all([
    getTrucks(organization.id),
    getTaxFilings(organization.id),
    getTrucksNow(organization.id, today()),
    getLastServiceByTruck(organization.id),
  ])

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <TrucksTable
        trucks={trucks}
        filings={filings}
        base={`/org/${organization.slug}/equipment`}
        today={today()}
        canManage={canManage(organization)}
        now={now}
        lastService={lastService}
        loadsBase={`/org/${organization.slug}/loads`}
        driversBase={`/org/${organization.slug}/drivers`}
      />
    </div>
  )
}
