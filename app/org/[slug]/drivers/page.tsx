import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { DriversTable } from "@/components/drivers/drivers-table"
import { today } from "@/lib/driver-format"
import { getDqDatesByDriver } from "@/lib/dq/fleet"
import { getDrivers, getDriversNow } from "@/lib/drivers"
import { canManage, getOrganization } from "@/lib/organizations"

export const metadata: Metadata = { title: "Drivers" }

export default async function DriversPage({
  params,
}: PageProps<"/org/[slug]/drivers">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const manager = canManage(organization)
  const [drivers, dqDates, now] = await Promise.all([
    getDrivers(organization.id),
    getDqDatesByDriver(organization.id),
    getDriversNow(organization.id, today()),
  ])

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div>
        <DriversTable
          drivers={drivers}
          base={`/org/${organization.slug}/drivers`}
          today={today()}
          canManage={manager}
          dqDates={dqDates}
          now={now}
          loadsBase={`/org/${organization.slug}/loads`}
        />
      </div>
    </div>
  )
}
