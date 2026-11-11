"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { OrgSection } from "@/lib/org-nav"

/** True when `href` is the current page or one of its subpages (the dashboard matches only itself). */
export function useIsActive(base: string) {
  const pathname = usePathname()
  return (path: string) =>
    path
      ? pathname === `${base}/${path}` ||
        pathname.startsWith(`${base}/${path}/`)
      : pathname === base
}

export function NavMain({
  base,
  groups,
  dashboardBadge,
}: {
  base: string
  groups: { label?: string; items: OrgSection[] }[]
  dashboardBadge: number
}) {
  const isActive = useIsActive(base)

  return groups.map((group, index) => (
    <SidebarGroup key={group.label ?? index} className="py-1">
      {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.title}
                isActive={isActive(item.path)}
                render={
                  <Link href={item.path ? `${base}/${item.path}` : base} />
                }
              >
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuButton>
              {item.path === "" && dashboardBadge > 0 && (
                <SidebarMenuBadge
                  aria-label={`${dashboardBadge} items need action`}
                  className="bg-destructive text-white peer-data-active/menu-button:text-white"
                >
                  {dashboardBadge}
                </SidebarMenuBadge>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ))
}
