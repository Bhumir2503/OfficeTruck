import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { BrokersTable } from "@/components/brokers/brokers-table"
import { getBrokerMoney, getBrokers } from "@/lib/brokers"
import { localToday } from "@/lib/invoice-format"
import { getOrganization } from "@/lib/organizations"

export const metadata: Metadata = { title: "Customers" }

export default async function BrokersPage({
  params,
}: PageProps<"/org/[slug]/customers">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const [brokers, money] = await Promise.all([
    getBrokers(organization.id),
    getBrokerMoney(organization.id, localToday()),
  ])

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <BrokersTable
        brokers={brokers}
        money={money}
        base={`/org/${organization.slug}/customers`}
      />
    </div>
  )
}
