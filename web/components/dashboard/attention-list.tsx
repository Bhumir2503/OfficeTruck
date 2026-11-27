"use client"

import { cn } from "cn"
import {
  ChevronRightIcon,
  CircleCheckBig,
  ClockAlertIcon,
  FileWarningIcon,
  ListTodoIcon,
  PackageIcon,
  SendIcon,
  UserRoundXIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import {
  EmptyRow,
  HEAD,
  HEAD_ROW,
  ShowMore,
  TableCard,
} from "@/components/dashboard/table-panel"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { AttentionItem, AttentionKind } from "@/lib/dashboard-format"

const ICONS: Record<AttentionKind, LucideIcon> = {
  overdue: ClockAlertIcon,
  document: FileWarningIcon,
  needs_driver: UserRoundXIcon,
  pod: PackageIcon,
  invoice_ready: SendIcon,
}

const TONES: Record<AttentionItem["tone"], string> = {
  danger:
    "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-900/30 dark:text-red-400",
  warning:
    "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400",
  default: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
}

const FIRST = 6

/** The dashboard's to-do list, most pressing first. */
export function AttentionCard({
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
    <TableCard
      icon={ListTodoIcon}
      title="To do"
      count={items.length}
      actions={
        late > 0 && (
          <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700 ring-1 ring-red-600/20 ring-inset sm:text-xs dark:bg-red-900/30 dark:text-red-400">
            {late} late
          </span>
        )
      }
      footer={
        items.length > FIRST && (
          <ShowMore
            shown={shown.length}
            total={items.length}
            noun="items"
            showAll={showAll}
            onToggle={() => setShowAll((value) => !value)}
          />
        )
      }
      className="flex-1"
    >
      {items.length === 0 ? (
        <EmptyRow>
          <CircleCheckBig className="size-4 text-emerald-600" />
          All caught up.
        </EmptyRow>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className={HEAD_ROW}>
              <TableHead className={HEAD}>What needs doing</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((item) => {
              const Icon = ICONS[item.kind]
              return (
                // The title's link covers the whole row.
                <TableRow
                  key={item.key}
                  className={cn("relative", item.path && "cursor-pointer")}
                >
                  <TableCell className="max-w-0 py-2.5">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-md",
                          TONES[item.tone]
                        )}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        {item.path ? (
                          <Link
                            href={`${base}/${item.path}`}
                            className="block truncate text-xs font-medium after:absolute after:inset-0 sm:text-sm"
                          >
                            {item.title}
                          </Link>
                        ) : (
                          <span className="block truncate text-xs font-medium sm:text-sm">
                            {item.title}
                          </span>
                        )}
                        <span className="block truncate text-[10px] text-muted-foreground sm:text-xs">
                          {item.detail}
                        </span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.path && (
                      <ChevronRightIcon className="size-4 text-muted-foreground" />
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </TableCard>
  )
}
