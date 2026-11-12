import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { DriversTable } from "@/components/drivers/drivers-table"
import { today } from "@/lib/driver-format"
import { getDrivers } from "@/lib/drivers"
import { canManage, getOrganization } from "@/lib/organizations"

export const metadata: Metadata = { title: "Drivers" }

export default async function DriversPage({
  params,
}: PageProps<"/org/[slug]/drivers">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const drivers = await getDrivers(organization.id)

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div>
        <DriversTable
          drivers={drivers}
          base={`/org/${organization.slug}/drivers`}
          today={today()}
          canManage={canManage(organization)}
        />
      </div>
    </div>
  )
}
