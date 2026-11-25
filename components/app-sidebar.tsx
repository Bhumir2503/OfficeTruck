"use client"

import { PlusIcon } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import { OrganizationSwitcher } from "@/components/organization-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { NEW_LOAD, ORG_NAV, ORG_NAV_FOOTER } from "@/lib/org-nav"
import type { Organization } from "@/lib/organizations"

export function AppSidebar({
  organization,
  user,
  organizations,
  dashboardBadge,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  organization: Organization
  user: { name: string; email: string; avatarUrl: string | null }
  organizations: Organization[]
  dashboardBadge: number
}) {
  const base = `/org/${organization.slug}`

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <OrganizationSwitcher
            current={organization}
            organizations={organizations}
          />
          <SidebarMenuItem className="mt-2">
            <SidebarMenuButton
              size="lg"
              tooltip={NEW_LOAD.title}
              render={<Link href={`${base}/${NEW_LOAD.path}`} />}
              className="h-10 justify-center bg-primary text-base font-semibold text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
            >
              <PlusIcon className="size-5!" />
              <span>{NEW_LOAD.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain base={base} groups={ORG_NAV} dashboardBadge={dashboardBadge} />
        <NavSecondary base={base} items={ORG_NAV_FOOTER} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser base={base} user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
