"use client"

import { cn } from "cn"
import { Building2Icon, CreditCardIcon, UsersIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

export const SETTINGS_TABS = [
  { title: "General", path: "", icon: Building2Icon },
  { title: "Members", path: "members", icon: UsersIcon },
  { title: "Billing", path: "billing", icon: CreditCardIcon },
]

// A vertical list beside the content on wide screens, a scrolling row above it on small ones.
export function SettingsNav({ base }: { base: string }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Settings"
      className="-mx-4 flex shrink-0 gap-1 overflow-x-auto px-4 lg:mx-0 lg:w-48 lg:flex-col lg:px-0"
    >
      {SETTINGS_TABS.map((tab) => {
        const href = tab.path ? `${base}/${tab.path}` : base
        const active = pathname === href
        return (
          <Link
            key={tab.title}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-muted text-foreground"
            )}
          >
            <tab.icon className="size-4" />
            {tab.title}
          </Link>
        )
      })}
    </nav>
  )
}
