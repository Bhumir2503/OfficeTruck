import { cn } from "cn"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"

/**
 * A dashboard card holding a table, in the shadcnblocks Dashboard 2 style:
 * an icon, the title and a count, then whatever controls the table has.
 */
export function TableCard({
  icon: Icon,
  title,
  count,
  actions,
  filters,
  footer,
  className,
  children,
}: {
  icon: LucideIcon
  title: string
  count?: number
  /** Search and filter controls, on the right of the title. */
  actions?: ReactNode
  /** A row under the header, for the active filters. */
  filters?: ReactNode
  footer?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-w-0 flex-col rounded-xl border bg-card",
        className
      )}
    >
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-3.5">
        <div className="flex flex-1 items-center gap-2 sm:gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border shadow-xs sm:size-8">
            <Icon className="size-4 text-muted-foreground sm:size-4.5" />
          </span>
          <h2 className="text-sm font-medium sm:text-base">{title}</h2>
          {count !== undefined && (
            <span className="ml-1 inline-flex items-center rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground ring-1 ring-border ring-inset sm:text-xs">
              {count}
            </span>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {filters}
      <div className="@container flex-1 overflow-x-auto px-3 pb-3 sm:px-6 sm:pb-4">
        {children}
      </div>
      {footer && (
        <div className="flex flex-col items-center justify-between gap-3 border-t px-3 py-3 sm:flex-row sm:px-6">
          {footer}
        </div>
      )}
    </section>
  )
}

/** The header row's look, shared by every dashboard table. */
export const HEAD_ROW = "bg-muted/50 hover:bg-muted/50"
export const HEAD = "text-xs font-medium text-muted-foreground sm:text-sm"

/** A table with nothing in it. */
export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-24 items-center justify-center gap-2 rounded-md bg-muted/30 px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

/** "Showing 8 of 20", with a button to see the rest. */
export function ShowMore({
  shown,
  total,
  noun,
  showAll,
  onToggle,
}: {
  shown: number
  total: number
  /** Plural: "items". */
  noun: string
  showAll: boolean
  onToggle: () => void
}) {
  return (
    <>
      <span className="text-xs text-muted-foreground sm:text-sm">
        {showAll
          ? `Showing all ${total} ${noun}`
          : `Showing ${shown} of ${total} ${noun}`}
      </span>
      <Button variant="outline" size="sm" onClick={onToggle}>
        {showAll ? "Show fewer" : "Show all"}
      </Button>
    </>
  )
}
