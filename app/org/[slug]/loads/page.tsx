import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { LoadsTable } from "@/components/loads/loads-table"
import { getLoads } from "@/lib/loads"
import { getOrganization } from "@/lib/organizations"

export const metadata: Metadata = { title: "Loads" }

export default async function LoadsPage({
  params,
}: PageProps<"/org/[slug]/loads">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const base = `/org/${organization.slug}/loads`
  const loads = await getLoads(organization.id)

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div>
        <LoadsTable
          loads={loads}
          organizationId={organization.id}
          base={base}
        />
      </div>
    </div>
  )
}
