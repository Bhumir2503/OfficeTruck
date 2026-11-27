"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"

import { SettingsCardFooter } from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"

/** Rows per page on the dashboard's side-by-side cards, so they line up. */
export const DASHBOARD_PAGE = 5

/** One page of `items`, and what the pager needs to move between pages. */
export function usePage<T>(items: T[], size = DASHBOARD_PAGE) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(items.length / size))
  // A list that shrank (an item done, a load delivered) stays on a real page.
  const current = Math.min(page, pages)
  const from = (current - 1) * size
  return {
    shown: items.slice(from, from + size),
    pager: {
      from,
      to: Math.min(from + size, items.length),
      total: items.length,
      page: current,
      pages,
      onPage: setPage,
    },
  }
}

/**
 * The card's footer: "1–5 of 7" and previous / next. It's always there, so
 * cards side by side end at the same line whether or not they need pages.
 */
export function ListPager({
  from,
  to,
  total,
  page,
  pages,
  onPage,
  noun,
}: ReturnType<typeof usePage>["pager"] & {
  /** Plural: "items", "loads". */
  noun: string
}) {
  return (
    <SettingsCardFooter
      hint={
        total === 0 ? `No ${noun}` : `${from + 1}–${to} of ${total} ${noun}`
      }
    >
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="px-2 text-sm text-muted-foreground tabular-nums">
          {page} / {pages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </SettingsCardFooter>
  )
}

/**
 * The body height of the side-by-side cards on wide screens: room for a full
 * page of either list, so paging or a shorter list never moves the row.
 */
export const PAGED_BODY = "flex-1 xl:min-h-[22rem]"
