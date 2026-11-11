"use client"

import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { CreateOrganizationDialog } from "@/components/create-organization-dialog"
import { OrganizationAvatar } from "@/components/organization-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import type { Organization } from "@/lib/organizations"

export function OrganizationSwitcher({
  current,
  organizations,
}: {
  current: Organization
  organizations: Organization[]
}) {
  const { isMobile } = useSidebar()
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />
          }
        >
          <OrganizationAvatar
            name={current.name}
            className="size-8 rounded-lg"
          />
          <span className="truncate text-base font-semibold">
            {current.name}
          </span>
          <ChevronsUpDownIcon className="ml-auto" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="min-w-64"
          side={isMobile ? "bottom" : "right"}
          align="start"
          sideOffset={4}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Organizations
            </DropdownMenuLabel>
            {organizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                className="gap-2 p-2"
                render={<Link href={`/org/${org.slug}`} />}
              >
                <OrganizationAvatar
                  name={org.name}
                  className="size-6 rounded text-xs"
                />
                <span className="truncate">{org.name}</span>
                {org.id === current.id && (
                  <CheckIcon className="ml-auto" aria-label="Current" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 p-2"
            onClick={() => setCreateOpen(true)}
          >
            <div className="flex size-6 items-center justify-center rounded border">
              <PlusIcon className="size-4" />
            </div>
            New organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Outside the menu so it stays open after the menu closes. */}
      <CreateOrganizationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </SidebarMenuItem>
  )
}
