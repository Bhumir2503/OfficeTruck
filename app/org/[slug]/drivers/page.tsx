import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { DriversTable } from "@/components/drivers/drivers-table"
import { today } from "@/lib/driver-format"
import { getDqDatesByDriver, getFleetStatus } from "@/lib/dq/fleet"
import { getDrivers } from "@/lib/drivers"
import { canManage, getOrganization } from "@/lib/organizations"
import { formatWeek, shiftWeek, weekOf } from "@/lib/settlement-format"
import { getPayWeek } from "@/lib/settlements"

export const metadata: Metadata = { title: "Drivers" }

export default async function DriversPage({
  params,
}: PageProps<"/org/[slug]/drivers">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const manager = canManage(organization)
  // Pay status covers last week, the week payroll usually covers.
  const week = shiftWeek(weekOf(today()), -1)
  const [drivers, settlements, fleet, dqDates] = await Promise.all([
    getDrivers(organization.id),
    manager ? getPayWeek(organization.id, week) : null,
    getFleetStatus(organization.id, today()),
    getDqDatesByDriver(organization.id),
  ])
  // Each driver's qualification file status, for the Driver file column.
  const files = Object.fromEntries(
    [...fleet].map(([id, row]) => [id, row.status])
  )
  const pay = settlements && {
    week,
    label: formatWeek(week),
    byDriver: Object.fromEntries(
      settlements.map((s) => [
        s.driver.id,
        {
          status:
            s.status === "paid"
              ? ("paid" as const)
              : s.loads.length || s.adjustments.length
                ? ("to_pay" as const)
                : ("none" as const),
          net: s.totals.net,
        },
      ])
    ),
  }

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div>
        <DriversTable
          drivers={drivers}
          base={`/org/${organization.slug}/drivers`}
          today={today()}
          canManage={manager}
          pay={pay}
          files={files}
          dqDates={dqDates}
        />
      </div>
    </div>
  )
}
