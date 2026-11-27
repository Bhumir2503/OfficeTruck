import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { BrokerUpdatesSetting } from "@/components/settings/broker-updates-setting"
import { DetentionSetting } from "@/components/settings/detention-setting"
import { TonuPaySetting } from "@/components/settings/tonu-pay-setting"
import { InvoicingSetting } from "@/components/settings/invoicing-setting"
import { CompanyProfileSection } from "@/components/settings/company-profile-form"
import { DeleteOrganization } from "@/components/settings/delete-organization"
import { LeaveOrganization } from "@/components/settings/leave-organization"
import { IconUpload } from "@/components/settings/icon-upload"
import { OrganizationUrlForm } from "@/components/settings/organization-url-form"
import { SettingsPage } from "@/components/settings/settings-card"
import { TimeZoneSetting } from "@/components/settings/time-zone-setting"
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
    .select(
      "icon_url, time_zone, broker_updates, detention_notices, detention_auto_charge, auto_invoice, auto_invoice_reminders, tonu_driver_pay"
    )
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
      <IconUpload
        organizationId={organization.id}
        iconUrl={org?.icon_url ?? null}
        canEdit={canManage(organization)}
      />
      <CompanyProfileSection section="contact" {...props} />
      <CompanyProfileSection section="address" {...props} />
      <TimeZoneSetting
        organizationId={organization.id}
        timeZone={org?.time_zone ?? "America/Chicago"}
        canEdit={canManage(organization)}
      />
      <BrokerUpdatesSetting
        organizationId={organization.id}
        enabled={org?.broker_updates ?? false}
        canEdit={canManage(organization)}
      />
      <InvoicingSetting
        organizationId={organization.id}
        invoice={org?.auto_invoice ?? false}
        reminders={org?.auto_invoice_reminders ?? false}
        canEdit={canManage(organization)}
      />
      <DetentionSetting
        organizationId={organization.id}
        notices={org?.detention_notices ?? false}
        autoCharge={org?.detention_auto_charge ?? false}
        canEdit={canManage(organization)}
      />
      <TonuPaySetting
        organizationId={organization.id}
        pay={
          org?.tonu_driver_pay === null || org?.tonu_driver_pay === undefined
            ? null
            : Number(org.tonu_driver_pay)
        }
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
