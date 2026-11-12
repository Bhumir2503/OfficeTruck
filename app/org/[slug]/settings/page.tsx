import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CompanyProfileSection } from "@/components/settings/company-profile-form"
import { DeleteOrganization } from "@/components/settings/delete-organization"
import { LeaveOrganization } from "@/components/settings/leave-organization"
import { OrganizationUrlForm } from "@/components/settings/organization-url-form"
import { SettingsPage } from "@/components/settings/settings-card"
import {
  canManage,
  getOrganization,
  getOrganizationProfile,
} from "@/lib/organizations"

export const metadata: Metadata = { title: "Settings" }

export default async function GeneralSettingsPage({
  params,
}: PageProps<"/org/[slug]/settings">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const props = {
    organizationId: organization.id,
    profile: await getOrganizationProfile(organization.id),
    canEdit: canManage(organization),
  }

  return (
    <SettingsPage
      title="General"
      description="Your company profile, shown on invoices and used for broker and compliance checks."
    >
      <CompanyProfileSection section="company" {...props} />
      <CompanyProfileSection section="contact" {...props} />
      <CompanyProfileSection section="address" {...props} />
      <OrganizationUrlForm
        organizationId={organization.id}
        slug={organization.slug}
        canEdit={canManage(organization)}
      />
      <LeaveOrganization
        organizationId={organization.id}
        name={organization.name}
        isOwner={organization.role === "owner"}
      />
      <DeleteOrganization
        organizationId={organization.id}
        name={organization.name}
        slug={organization.slug}
        canDelete={organization.role === "owner"}
      />
    </SettingsPage>
  )
}
