"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { OrgSection } from "@/lib/org-nav"

/** True when `href` is the current page or one of its subpages. */
export function useIsActive(base: string) {
  const pathname = usePathname()
  return (path: string) =>
    pathname === `${base}/${path}` || pathname.startsWith(`${base}/${path}/`)
}

export function NavMain({
  base,
  groups,
}: {
  base: string
  groups: { label?: string; items: OrgSection[] }[]
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
                render={<Link href={`${base}/${item.path}`} />}
              >
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ))
}
