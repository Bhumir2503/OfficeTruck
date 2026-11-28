import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { IftaView } from "@/components/ifta/ifta-view"
import { today as getToday } from "@/lib/driver-format"
import { getIftaQuarter } from "@/lib/ifta"
import {
  defaultQuarter,
  loadMilesByTruck,
  parseQuarter,
  quarterKey,
  quarterRange,
  recentQuarters,
} from "@/lib/ifta-format"
import { canManage, getOrganization } from "@/lib/organizations"
import { getReportLoads } from "@/lib/reports"
import { getTrucks } from "@/lib/trucks"

export const metadata: Metadata = { title: "IFTA" }

export default async function IftaPage({
  params,
  searchParams,
}: PageProps<"/org/[slug]/ifta">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const today = getToday()
  const { q } = await searchParams
  const quarter =
    parseQuarter(typeof q === "string" ? q : null) ?? defaultQuarter(today)
  // Two years back, and whichever older quarter the link asked for.
  const quarters = recentQuarters(today, 8)
  if (!quarters.some((item) => quarterKey(item) === quarterKey(quarter))) {
    quarters.push(quarter)
  }

  const [record, trucks, loads] = await Promise.all([
    getIftaQuarter(organization.id, quarter),
    getTrucks(organization.id),
    // Only the quarter's loads count toward its miles.
    getReportLoads(organization.id, quarterRange(quarter).start),
  ])

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <IftaView
        organizationId={organization.id}
        quarter={quarter}
        quarters={quarters}
        today={today}
        filedOn={record.filedOn}
        miles={record.miles}
        fuel={record.fuel}
        trucks={trucks
          .map((truck) => ({
            id: truck.id,
            name: truck.unit_number,
            active: truck.status !== "inactive",
          }))
          .sort((a, b) => Number(b.active) - Number(a.active))}
        loadMiles={loadMilesByTruck(loads, quarter)}
        canManage={canManage(organization)}
        base={`/org/${organization.slug}/ifta`}
        loadsBase={`/org/${organization.slug}/loads`}
      />
    </div>
  )
}
