"use client"

import { cn } from "cn"
import {
  ChevronRightIcon,
  CircleCheckBig,
  ClockAlertIcon,
  FileWarningIcon,
  PackageIcon,
  SendIcon,
  UserRoundXIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import type { AttentionItem, AttentionKind } from "@/lib/dashboard-format"

const ICONS: Record<AttentionKind, LucideIcon> = {
  overdue: ClockAlertIcon,
  document: FileWarningIcon,
  needs_driver: UserRoundXIcon,
  pod: PackageIcon,
  invoice_ready: SendIcon,
}

const TONES: Record<AttentionItem["tone"], string> = {
  danger: "bg-destructive/10 text-destructive",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  default: "bg-muted text-muted-foreground",
}

const FIRST = 8

/** The dashboard's to-do list, most pressing first. */
export function AttentionList({
  items,
  base,
}: {
  items: AttentionItem[]
  /** /org/<slug> */
  base: string
}) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? items : items.slice(0, FIRST)
  const late = items.filter((item) => item.tone === "danger").length

  return (
    <SettingsCard
      title="To do"
      description={
        items.length === 0
          ? undefined
          : late > 0
            ? `${items.length} open, ${late} late`
            : `${items.length} open`
      }
      contentClassName={items.length ? "px-0 pb-0" : "pt-1 pb-5"}
      footer={
        items.length > FIRST && (
          <SettingsCardFooter
            hint={
              showAll
                ? `Showing all ${items.length}.`
                : `Showing ${FIRST} of ${items.length}.`
            }
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? "Show fewer" : "Show all"}
            </Button>
          </SettingsCardFooter>
        )
      }
    >
      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleCheckBig className="size-4 text-emerald-600" />
          All caught up.
        </p>
      ) : (
        <ul className="divide-y border-t">
          {shown.map((item) => {
            const Icon = ICONS[item.kind]
            const body = (
              <>
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg",
                    TONES[item.tone]
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {item.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.detail}
                  </span>
                </span>
                {item.path && (
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                )}
              </>
            )
            return (
              <li key={item.key}>
                {item.path ? (
                  <Link
                    href={`${base}/${item.path}`}
                    className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/50"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-6 py-3">
                    {body}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </SettingsCard>
  )
}
