import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CompanyProfileSection } from "@/components/settings/company-profile-form"
import { DispatchSettings } from "@/components/settings/dispatch-settings"
import { DeleteOrganization } from "@/components/settings/delete-organization"
import { LeaveOrganization } from "@/components/settings/leave-organization"
import { OrganizationUrlForm } from "@/components/settings/organization-url-form"
import { SettingsPage } from "@/components/settings/settings-card"
import {
  canManage,
  getOrganization,
  getOrganizationProfile,
} from "@/lib/organizations"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Settings" }

export default async function GeneralSettingsPage({
  params,
}: PageProps<"/org/[slug]/settings">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const { data: org } = await (
    await createClient()
  )
    .from("organizations")
    .select("share_rate_with_drivers")
    .eq("id", organization.id)
    .single()

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
      <DispatchSettings
        organizationId={organization.id}
        shareRate={org?.share_rate_with_drivers ?? false}
        canEdit={canManage(organization)}
      />
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
