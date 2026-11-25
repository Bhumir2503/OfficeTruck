import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { FactoringForm } from "@/components/settings/factoring-form"
import { SettingsPage } from "@/components/settings/settings-card"
import { getFactoringCompany } from "@/lib/factoring"
import { canManage, getOrganization } from "@/lib/organizations"

export const metadata: Metadata = { title: "Factoring" }

export default async function FactoringSettingsPage({
  params,
}: PageProps<"/org/[slug]/settings/factoring">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const company = await getFactoringCompany(organization.id)

  return (
    <SettingsPage
      title="Factoring"
      description="The company you sell invoices to. Brokers you mark as factored send their packets and payments here."
    >
      <FactoringForm
        organizationId={organization.id}
        company={company}
        canEdit={canManage(organization)}
      />
    </SettingsPage>
  )
}
