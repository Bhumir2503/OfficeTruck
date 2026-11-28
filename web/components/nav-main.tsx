"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Suspense, use } from "react"

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

/**
 * The dashboard's to-do count. It streams in after the page: working it out
 * reads invoices, loads and documents, and no page should wait on it.
 */
function DashboardBadge({ count }: { count: Promise<number> | number }) {
  const n = typeof count === "number" ? count : use(count)
  if (n <= 0) return null
  return (
    <SidebarMenuBadge
      aria-label={`${n} items need action`}
      className="bg-destructive text-white peer-data-active/menu-button:text-white"
    >
      {n}
    </SidebarMenuBadge>
  )
}

export function NavMain({
  base,
  groups,
  dashboardBadge,
}: {
  base: string
  groups: { label?: string; items: OrgSection[] }[]
  dashboardBadge: Promise<number> | number
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
              {item.path === "" && (
                <Suspense fallback={null}>
                  <DashboardBadge count={dashboardBadge} />
                </Suspense>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ))
}
