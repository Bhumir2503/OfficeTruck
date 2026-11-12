import type { Metadata } from "next"
import { redirect } from "next/navigation"

import {
  EmailForm,
  PasswordForm,
  ProfileForm,
  SignOutEverywhere,
} from "@/components/account/account-forms"
import { AccountOrganizations } from "@/components/account/account-organizations"
import { SettingsPage } from "@/components/settings/settings-card"
import { getAccount } from "@/lib/account"
import { ACCOUNT } from "@/lib/org-nav"
import { getMyOrganizations } from "@/lib/organizations"

export const metadata: Metadata = { title: ACCOUNT.title }

export default async function AccountPage({
  params,
  searchParams,
}: PageProps<"/org/[slug]/account">) {
  const [{ slug }, { email_link }, account, organizations] = await Promise.all([
    params,
    searchParams,
    getAccount(),
    getMyOrganizations(),
  ])
  if (!account) {
    redirect("/login")
  }

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="max-w-3xl">
        <SettingsPage title={ACCOUNT.title} description={ACCOUNT.description}>
          <ProfileForm account={account} />
          <EmailForm
            account={account}
            linkResult={
              email_link === "confirmed" || email_link === "invalid"
                ? email_link
                : null
            }
          />
          <PasswordForm email={account.email} />
          <AccountOrganizations
            organizations={organizations}
            currentSlug={slug}
          />
          <SignOutEverywhere />
        </SettingsPage>
      </div>
    </div>
  )
}
