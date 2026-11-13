import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { BrokerForm } from "@/components/brokers/broker-form"
import { getFactoringCompany } from "@/lib/factoring"
import { getOrganization } from "@/lib/organizations"

export const metadata: Metadata = { title: "Add broker" }

export default async function NewBrokerPage({
  params,
}: PageProps<"/org/[slug]/brokers/new">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-5xl">
        <BrokerForm
          organizationId={organization.id}
          base={`/org/${organization.slug}/brokers`}
          factoring={await getFactoringCompany(organization.id)}
          factoringHref={`/org/${organization.slug}/settings/factoring`}
        />
      </div>
    </div>
  )
}
