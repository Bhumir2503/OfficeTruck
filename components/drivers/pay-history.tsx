"use client"

import { ChevronLeft, ChevronRight, History } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate } from "@/lib/driver-format"
import { formatRate } from "@/lib/load-format"
import { formatPeriod } from "@/lib/settlement-format"
import type { PaidWeek } from "@/lib/settlements"

/** Pay periods shown at a time, as on the truck page. */
const PAGE_SIZE = 5

/** "1–5 of 12", or "6 of 6" when a page has one period. */
const range = (first: number, last: number, total: number) =>
  `${first === last ? first : `${first}–${last}`} of ${total}`

/** The weeks already paid, newest first, each opening its statement. */
export function PayHistory({
  weeks,
  payHref,
  today,
}: {
  weeks: PaidWeek[]
  /** The driver's Payment tab, /org/<slug>/drivers/<id>?tab=pay */
  payHref: string
  /** "YYYY-MM-DD", for the year's total. */
  today: string
}) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(weeks.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const first = current * PAGE_SIZE
  const shown = weeks.slice(first, first + PAGE_SIZE)
  const paidThisYear = weeks
    .filter((week) => week.paid_on.slice(0, 4) === today.slice(0, 4))
    .reduce((sum, week) => sum + week.net, 0)

  return (
    <SettingsCard
      title="Pay history"
      description={
        weeks.length ? (
          <>
            Pay periods marked paid, as they were paid.
            <span className="mt-1 block text-foreground tabular-nums">
              {formatRate(paidThisYear)} paid this year
            </span>
          </>
        ) : (
          "Pay periods marked paid, as they were paid."
        )
      }
      contentClassName={weeks.length ? "px-0 pb-0" : undefined}
      footer={
        weeks.length > 0 && (
          <SettingsCardFooter
            hint={range(first + 1, first + shown.length, weeks.length)}
          >
            <Button
              variant="outline"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={current === pages - 1}
              onClick={() => setPage(current + 1)}
            >
              Next
              <ChevronRight />
            </Button>
          </SettingsCardFooter>
        )
      }
    >
      {weeks.length === 0 ? (
        <SettingsEmptyState icon={History} title="Nothing paid yet">
          Mark a pay period paid on the statement above and it shows up here.
        </SettingsEmptyState>
      ) : (
        <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead className="hidden sm:table-cell">Paid on</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                Loads
              </TableHead>
              <TableHead className="hidden text-right md:table-cell">
                Adjustments
              </TableHead>
              <TableHead className="text-right">Net pay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((week) => (
              <TableRow key={week.week}>
                <TableCell className="py-3">
                  <Link
                    // Its own dates, in case the driver's schedule changed.
                    href={`${payHref}&week=${week.week}&end=${week.end}#pay`}
                    scroll={false}
                    className="font-medium hover:underline"
                  >
                    {formatPeriod(week.week, week.end)}
                  </Link>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {formatDate(week.paid_on)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {week.loads}
                </TableCell>
                <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                  {formatRate(week.adjustments)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatRate(week.net)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SettingsCard>
  )
}
