import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { TrucksTable } from "@/components/trucks/trucks-table"
import { today } from "@/lib/driver-format"
import { canManage, getOrganization } from "@/lib/organizations"
import { getTaxFilings, getTrucks } from "@/lib/trucks"

export const metadata: Metadata = { title: "Trucks" }

export default async function TrucksPage({
  params,
}: PageProps<"/org/[slug]/equipment">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const [trucks, filings] = await Promise.all([
    getTrucks(organization.id),
    getTaxFilings(organization.id),
  ])

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <TrucksTable
        trucks={trucks}
        filings={filings}
        base={`/org/${organization.slug}/equipment`}
        today={today()}
        canManage={canManage(organization)}
      />
    </div>
  )
}
