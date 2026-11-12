import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { NewLoadForm } from "@/components/loads/new-load-form"
import { getBrokerOptions } from "@/lib/brokers"
import { getDriverOptions } from "@/lib/drivers"
import { getOrganization } from "@/lib/organizations"
import { getTruckOptions } from "@/lib/trucks"

export const metadata: Metadata = { title: "New load" }

export default async function NewLoadPage({
  params,
}: PageProps<"/org/[slug]/loads/new">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-5xl">
        <NewLoadForm
          organizationId={organization.id}
          base={`/org/${organization.slug}/loads`}
          drivers={await getDriverOptions(organization.id)}
          driversHref={`/org/${organization.slug}/drivers`}
          trucks={await getTruckOptions(organization.id)}
          trucksHref={`/org/${organization.slug}/equipment`}
          brokers={await getBrokerOptions(organization.id)}
          brokersHref={`/org/${organization.slug}/brokers`}
        />
      </div>
    </div>
  )
}
