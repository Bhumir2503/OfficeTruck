import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { LoadsTable } from "@/components/loads/loads-table"
import { getDriverOptions } from "@/lib/drivers"
import { getLoadInvoices } from "@/lib/invoices"
import { getLoads, getPaymentsDue } from "@/lib/loads"
import { getOrganization } from "@/lib/organizations"
import { getTruckOptions } from "@/lib/trucks"

export const metadata: Metadata = { title: "Loads" }

export default async function LoadsPage({
  params,
}: PageProps<"/org/[slug]/loads">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const base = `/org/${organization.slug}/loads`
  const [loads, drivers, trucks, invoices] = await Promise.all([
    getLoads(organization.id),
    getDriverOptions(organization.id),
    getTruckOptions(organization.id),
    getLoadInvoices(organization.id),
  ])
  const payments = await getPaymentsDue(organization.id, loads)

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div>
        <LoadsTable
          loads={loads}
          payments={payments}
          context={{
            organizationId: organization.id,
            drivers,
            trucks,
            orgBase: `/org/${organization.slug}`,
            loads,
            invoices,
          }}
          base={base}
        />
      </div>
    </div>
  )
}
