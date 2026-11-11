"use client"

import Link from "next/link"
import * as React from "react"

import { useIsActive } from "@/components/nav-main"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { OrgSection } from "@/lib/org-nav"

export function NavSecondary({
  base,
  items,
  ...props
}: {
  base: string
  items: OrgSection[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const isActive = useIsActive(base)

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
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
  )
}
