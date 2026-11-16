"use client"

import { cn } from "cn"
import { Loader2, Trash2 } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  addAdjustment,
  markPaid,
  removeAdjustment,
  undoPaid,
} from "@/app/org/[slug]/pay/actions"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { EXPENSE_LABELS, type ExpenseKind } from "@/lib/load-expense-format"
import { formatRate, formatStopDate } from "@/lib/load-format"
import { formatWeek } from "@/lib/settlement-format"
import type { Settlement } from "@/lib/settlements"

const TABLE =
  "[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6"

function Line({
  label,
  value,
  strong,
}: {
  label: string
  value: number
  strong?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-2",
        strong && "font-semibold"
      )}
    >
      <dt className={cn(!strong && "text-muted-foreground")}>{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          value < 0 && !strong && "text-destructive"
        )}
      >
        {formatRate(value)}
      </dd>
    </div>
  )
}

function AdjustmentForm({
  organizationId,
  settlement,
}: {
  organizationId: string
  settlement: Settlement
}) {
  const [direction, setDirection] = useState<"add" | "deduct">("deduct")
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [pending, start] = useTransition()

  return (
    <form
      className="flex flex-col gap-3 border-t px-6 py-4 sm:flex-row sm:items-center"
      onSubmit={(event) => {
        event.preventDefault()
        start(async () => {
          const result = await addAdjustment(
            organizationId,
            settlement.driver.id,
            settlement.week,
            { description, amount, direction }
          )
          if ("error" in result) {
            toast.error(result.error)
            return
          }
          setDescription("")
          setAmount("")
        })
      }}
    >
      <ToggleGroup
        aria-label="Add or take off"
        variant="outline"
        size="sm"
        spacing={1}
        className="shrink-0"
        value={[direction]}
        onValueChange={(value: string[]) => {
          if (value[0]) setDirection(value[0] as "add" | "deduct")
        }}
      >
        <ToggleGroupItem value="deduct">Take off</ToggleGroupItem>
        <ToggleGroupItem value="add">Add</ToggleGroupItem>
      </ToggleGroup>
      <Input
        aria-label="What it's for"
        placeholder={
          direction === "deduct"
            ? "e.g. Cash advance, escrow"
            : "e.g. Safety bonus, detention"
        }
        value={description}
        maxLength={200}
        onChange={(event) => setDescription(event.target.value)}
      />
      <Input
        aria-label="Amount"
        inputMode="decimal"
        placeholder="0.00"
        className="sm:w-28"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={pending || !description.trim() || !amount.trim()}
      >
        {pending && <Loader2 className="animate-spin" />}
        Add
      </Button>
    </form>
  )
}

/** One driver's pay statement for a week. */
export function SettlementView({
  organizationId,
  settlement,
  today,
  loadsBase,
}: {
  organizationId: string
  settlement: Settlement
  /** "YYYY-MM-DD", the default paid-on date. */
  today: string
  /** /org/<slug>/loads */
  loadsBase: string
}) {
  const [paidOn, setPaidOn] = useState(today)
  const [pending, start] = useTransition()
  const paid = settlement.status === "paid"
  const { totals } = settlement
  const nothing =
    settlement.loads.length === 0 && settlement.adjustments.length === 0
  const loadRef = new Map(settlement.loads.map((l) => [l.id, l.reference]))

  const run = (
    action: () => Promise<{ error: string } | { ok: true }>,
    done: string
  ) =>
    start(async () => {
      const result = await action()
      if ("error" in result) toast.error(result.error)
      else toast.success(done)
    })

  return (
    <div className="grid gap-6 @5xl/main:grid-cols-3">
      <div className="flex flex-col gap-6 @5xl/main:col-span-2">
        <SettingsCard
          title="Loads"
          description="Delivered this week, at the pay rate locked on each load."
          contentClassName={
            settlement.loads.length ? "@container px-0 pb-0" : undefined
          }
        >
          {settlement.loads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No loads delivered this week.
            </p>
          ) : (
            <Table className={TABLE}>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-full">Load</TableHead>
                  <TableHead className="hidden w-px @xl:table-cell">
                    Delivered
                  </TableHead>
                  <TableHead className="hidden text-right @lg:table-cell">
                    Miles
                  </TableHead>
                  <TableHead className="text-right">Pay</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlement.loads.map((load) => (
                  <TableRow key={load.id}>
                    <TableCell className="max-w-0">
                      <Link
                        href={`${loadsBase}/${load.id}`}
                        className="font-medium hover:underline"
                      >
                        {load.reference}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {load.route}
                      </p>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground @xl:table-cell">
                      {formatStopDate(load.delivery_start)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums @lg:table-cell">
                      {load.miles ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {load.pay === null ? (
                        <span className="text-destructive">Needs miles</span>
                      ) : (
                        formatRate(load.pay)
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SettingsCard>

        {settlement.expenses.length > 0 && (
          <SettingsCard
            title="Owed back"
            description="Paid out of the driver's pocket on these loads."
            contentClassName="px-0 pb-0"
          >
            <Table className={TABLE}>
              <TableBody>
                {settlement.expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="w-full">
                      {EXPENSE_LABELS[expense.kind as ExpenseKind] ??
                        expense.kind}
                      <span className="text-muted-foreground">
                        {" · "}
                        {loadRef.get(expense.load_id)}
                        {expense.note && ` · ${expense.note}`}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRate(expense.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SettingsCard>
        )}

        <SettingsCard
          title="Adjustments"
          description="Advances, escrow and fuel card charges come off; bonuses and extra pay go on."
          contentClassName="px-0 pb-0"
        >
          {settlement.adjustments.length > 0 && (
            <Table className={TABLE}>
              <TableBody>
                {settlement.adjustments.map((adjustment) => (
                  <TableRow key={adjustment.id}>
                    <TableCell className="w-full">
                      {adjustment.description}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        adjustment.amount < 0 && "text-destructive"
                      )}
                    >
                      {formatRate(adjustment.amount)}
                    </TableCell>
                    {!paid && (
                      <TableCell className="w-px">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${adjustment.description}`}
                          disabled={pending}
                          onClick={() =>
                            run(
                              () =>
                                removeAdjustment(organizationId, adjustment.id),
                              "Removed."
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {paid ? (
            settlement.adjustments.length === 0 && (
              <p className="px-6 pb-5 text-sm text-muted-foreground">None.</p>
            )
          ) : (
            <AdjustmentForm
              organizationId={organizationId}
              settlement={settlement}
            />
          )}
        </SettingsCard>
      </div>

      <div className="flex flex-col gap-6">
        <SettingsCard
          title={formatWeek(settlement.week)}
          description={
            paid && settlement.paid_on
              ? `Paid ${formatStopDate(settlement.paid_on)}.`
              : `${totals.loads} ${totals.loads === 1 ? "load" : "loads"}, ${totals.miles.toLocaleString("en-US")} miles.`
          }
          contentClassName="pt-2 pb-4"
          footer={
            <SettingsCardFooter
              hint={
                !paid && totals.unpriced > 0 ? (
                  <span className="text-destructive">
                    Add miles to {totals.unpriced}{" "}
                    {totals.unpriced === 1 ? "load" : "loads"} before paying.
                  </span>
                ) : undefined
              }
            >
              {paid ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => undoPaid(organizationId, settlement.id!),
                      "Marked unpaid."
                    )
                  }
                >
                  Undo payment
                </Button>
              ) : (
                <>
                  <Input
                    type="date"
                    aria-label="Paid on"
                    className="h-8 w-36"
                    value={paidOn}
                    onChange={(event) => setPaidOn(event.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={pending || nothing || totals.unpriced > 0}
                    onClick={() =>
                      run(
                        () =>
                          markPaid(
                            organizationId,
                            settlement.driver.id,
                            settlement.week,
                            paidOn
                          ),
                        `${settlement.driver.full_name} marked paid.`
                      )
                    }
                  >
                    {pending && <Loader2 className="animate-spin" />}
                    Mark paid
                  </Button>
                </>
              )}
            </SettingsCardFooter>
          }
        >
          <dl className="divide-y text-sm">
            <Line label="Load pay" value={totals.gross} />
            <Line label="Owed back" value={totals.reimbursements} />
            <Line label="Adjustments" value={totals.adjustments} />
            <Line label="Net pay" value={totals.net} strong />
          </dl>
        </SettingsCard>
      </div>
    </div>
  )
}
