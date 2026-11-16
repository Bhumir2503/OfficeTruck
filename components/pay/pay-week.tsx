import { cn } from "cn"
import { ChevronLeft, ChevronRight, Wallet } from "lucide-react"
import Link from "next/link"

import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatRate } from "@/lib/load-format"
import { formatWeek, shiftWeek } from "@/lib/settlement-format"
import type { Settlement } from "@/lib/settlements"

const TABLE =
  "[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6"

export function SettlementStatus({ settlement }: { settlement: Settlement }) {
  const paid = settlement.status === "paid"
  const empty =
    settlement.loads.length === 0 && settlement.adjustments.length === 0
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        paid
          ? "bg-green-600/15 text-green-800 dark:text-green-300"
          : empty
            ? "bg-muted text-muted-foreground"
            : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      )}
    >
      {paid ? "Paid" : empty ? "Nothing to pay" : "To pay"}
    </span>
  )
}

/** Every driver's pay for one week, with arrows to move between weeks. */
export function PayWeek({
  settlements,
  week,
  thisWeek,
  base,
}: {
  settlements: Settlement[]
  /** The Monday shown. */
  week: string
  /** The Monday of the current week, so the next arrow stops there. */
  thisWeek: string
  /** /org/<slug>/pay */
  base: string
}) {
  const toPay = settlements.filter(
    (s) => s.status === "open" && (s.loads.length || s.adjustments.length)
  )
  const owed = toPay.reduce((sum, s) => sum + s.totals.net, 0)
  const paid = settlements
    .filter((s) => s.status === "paid")
    .reduce((sum, s) => sum + s.totals.net, 0)
  const nav = buttonVariants({ variant: "outline", size: "icon-sm" })

  return (
    <SettingsCard
      title={formatWeek(week)}
      description="Loads delivered Monday to Sunday, at each load's locked pay rate, plus money drivers spent out of pocket."
      action={
        <div className="flex items-center gap-1">
          <Link
            href={`${base}?week=${shiftWeek(week, -1)}`}
            className={nav}
            aria-label="Previous week"
          >
            <ChevronLeft />
          </Link>
          {week < thisWeek ? (
            <Link
              href={`${base}?week=${shiftWeek(week, 1)}`}
              className={nav}
              aria-label="Next week"
            >
              <ChevronRight />
            </Link>
          ) : (
            <span className={cn(nav, "pointer-events-none opacity-40")}>
              <ChevronRight />
            </span>
          )}
        </div>
      }
      contentClassName={settlements.length ? "@container px-0 pb-0" : undefined}
      footer={
        settlements.length > 0 && (
          <SettingsCardFooter
            hint={
              toPay.length
                ? `${formatRate(owed)} to pay ${toPay.length === 1 ? "1 driver" : `${toPay.length} drivers`}${paid ? `, ${formatRate(paid)} already paid` : ""}.`
                : paid
                  ? `All paid: ${formatRate(paid)}.`
                  : "Nothing to pay this week."
            }
          />
        )
      }
    >
      {settlements.length === 0 ? (
        <SettingsEmptyState icon={Wallet} title="No drivers yet">
          Add drivers and assign them loads. Their weekly pay shows up here once
          loads are delivered.
        </SettingsEmptyState>
      ) : (
        <Table className={TABLE}>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="w-full">Driver</TableHead>
              <TableHead className="hidden text-right @xl:table-cell">
                Load pay
              </TableHead>
              <TableHead className="hidden text-right @2xl:table-cell">
                Owed back
              </TableHead>
              <TableHead className="hidden text-right @2xl:table-cell">
                Adjustments
              </TableHead>
              <TableHead className="text-right">Net pay</TableHead>
              <TableHead className="w-px">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {settlements.map((settlement) => (
              <TableRow key={settlement.driver.id}>
                <TableCell className="max-w-0">
                  <Link
                    href={`${base}/${settlement.driver.id}?week=${week}`}
                    className="font-medium hover:underline"
                  >
                    {settlement.driver.full_name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {settlement.totals.loads === 1
                      ? "1 load"
                      : `${settlement.totals.loads} loads`}
                    {settlement.totals.unpriced > 0 &&
                      ` · ${settlement.totals.unpriced} missing miles`}
                  </p>
                </TableCell>
                <TableCell className="hidden text-right tabular-nums @xl:table-cell">
                  {formatRate(settlement.totals.gross)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums @2xl:table-cell">
                  {settlement.totals.reimbursements
                    ? formatRate(settlement.totals.reimbursements)
                    : "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "hidden text-right tabular-nums @2xl:table-cell",
                    settlement.totals.adjustments < 0 && "text-destructive"
                  )}
                >
                  {settlement.totals.adjustments
                    ? formatRate(settlement.totals.adjustments)
                    : "—"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatRate(settlement.totals.net)}
                </TableCell>
                <TableCell>
                  <SettlementStatus settlement={settlement} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SettingsCard>
  )
}
