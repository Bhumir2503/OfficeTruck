import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CompanyProfileSection } from "@/components/settings/company-profile-form"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsPage,
} from "@/components/settings/settings-card"
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
      <SettingsCard
        title="Organization URL"
        description="The web address for your organization in OfficeTruck."
        footer={
          <SettingsCardFooter hint="The URL can't be changed, so links your team has saved keep working." />
        }
      >
        <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">
          <span className="text-muted-foreground">/org/</span>
          <span className="font-medium">{organization.slug}</span>
        </div>
      </SettingsCard>
    </SettingsPage>
  )
}
