import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { LoadsTable } from "@/components/loads/loads-table"
import { getDriverOptions } from "@/lib/drivers"
import { getLoads, getPaymentsDue } from "@/lib/loads"
import { getOrganization } from "@/lib/organizations"
import { createClient } from "@/lib/supabase/server"
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
  const supabase = await createClient()
  const [loads, drivers, trucks, { data: org }] = await Promise.all([
    getLoads(organization.id),
    getDriverOptions(organization.id),
    getTruckOptions(organization.id),
    supabase
      .from("organizations")
      .select("share_rate_with_drivers")
      .eq("id", organization.id)
      .single(),
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
            shareRate: org?.share_rate_with_drivers ?? false,
            orgBase: `/org/${organization.slug}`,
            loads,
          }}
          base={base}
        />
      </div>
    </div>
  )
}
