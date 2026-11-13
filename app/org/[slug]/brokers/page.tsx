import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { BrokersTable } from "@/components/brokers/brokers-table"
import { getBrokers } from "@/lib/brokers"
import { getOrganization } from "@/lib/organizations"

export const metadata: Metadata = { title: "Brokers" }

export default async function BrokersPage({
  params,
}: PageProps<"/org/[slug]/brokers">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <BrokersTable
        brokers={await getBrokers(organization.id)}
        base={`/org/${organization.slug}/brokers`}
      />
    </div>
  )
}
