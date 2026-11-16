import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { AllDocuments } from "@/components/documents/all-documents"
import { CompanyDocuments } from "@/components/documents/company-documents"
import { getAllDocuments, getCompanyDocuments } from "@/lib/documents"
import { today } from "@/lib/driver-format"
import { getOrganization } from "@/lib/organizations"

export const metadata: Metadata = { title: "Documents" }

export default async function DocumentsPage({
  params,
}: PageProps<"/org/[slug]/documents">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }
  const company = await getCompanyDocuments(organization.id)
  const entries = await getAllDocuments(organization.id, company)

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="flex flex-col gap-6">
        <CompanyDocuments
          organizationId={organization.id}
          documents={company}
          today={today()}
        />
        <AllDocuments entries={entries} base={`/org/${organization.slug}`} />
      </div>
    </div>
  )
}
