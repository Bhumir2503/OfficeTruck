import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ReportsView } from "@/components/reports/reports-view"
import { localToday } from "@/lib/invoice-format"
import { getOrganization } from "@/lib/organizations"
import { getReportLoads } from "@/lib/reports"

export const metadata: Metadata = { title: "Reports" }

export default async function ReportsPage({
  params,
}: PageProps<"/org/[slug]/reports">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const loads = await getReportLoads(organization.id)

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <ReportsView
        loads={loads}
        today={localToday()}
        orgBase={`/org/${organization.slug}`}
      />
    </div>
  )
}
