import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { BillingCards } from "@/components/settings/billing-cards"
import { getOrganization } from "@/lib/organizations"
import { getTrucks } from "@/lib/trucks"

export const metadata: Metadata = { title: "Billing" }

export default async function BillingSettingsPage({
  params,
}: PageProps<"/org/[slug]/settings/billing">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const trucks = await getTrucks(organization.id)
  const count = (status: string) =>
    trucks.filter((truck) => truck.status === status).length

  return (
    <BillingCards
      activeTrucks={count("active")}
      parkedTrucks={count("out_of_service")}
    />
  )
}
