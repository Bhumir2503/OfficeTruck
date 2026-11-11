import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { getActionCounts, totalActions } from "@/lib/action-counts"
import {
  getMyOrganizations,
  getOrganization,
  getUser,
} from "@/lib/organizations"

export async function generateMetadata({
  params,
}: LayoutProps<"/org/[slug]">): Promise<Metadata> {
  const organization = await getOrganization((await params).slug)
  const name = organization?.name ?? "Not found"
  return {
    title: { template: `%s | ${name} | OfficeTruck`, default: name },
  }
}

export default async function OrganizationLayout({
  params,
  children,
}: LayoutProps<"/org/[slug]">) {
  const user = await getUser()
  if (!user) {
    redirect("/login")
  }

  // Also 404s for organizations the user isn't a member of.
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const email = user.email ?? ""
  const name = String(user.user_metadata?.full_name || email.split("@")[0])

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        variant="inset"
        organization={organization}
        user={{ name, email }}
        organizations={await getMyOrganizations()}
        dashboardBadge={totalActions(await getActionCounts())}
      />
      <SidebarInset>
        <SiteHeader slug={organization.slug} />
        <div className="@container/main flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
