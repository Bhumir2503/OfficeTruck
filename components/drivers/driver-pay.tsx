"use client"

import { cn } from "cn"
import { ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  addAdjustment,
  markPaid,
  removeAdjustment,
  undoPaid,
} from "@/app/org/[slug]/drivers/pay-actions"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { EXPENSE_LABELS, type ExpenseKind } from "@/lib/load-expense-format"
import { formatRate, formatStopDate } from "@/lib/load-format"
import { formatWeek } from "@/lib/settlement-format"
import type { Settlement } from "@/lib/settlements"

/** Paid, to pay, or nothing to pay, for a driver's week. */
export function PayStatusBadge({
  status,
}: {
  status: "paid" | "to_pay" | "none"
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        status === "paid"
          ? "bg-green-600/15 text-green-800 dark:text-green-300"
          : status === "to_pay"
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
            : "bg-muted text-muted-foreground"
      )}
    >
      {status === "paid"
        ? "Paid"
        : status === "to_pay"
          ? "To pay"
          : "Nothing to pay"}
    </span>
  )
}

/** Where a settlement stands, for the badge. */
export function payStatus(settlement: Settlement) {
  if (settlement.status === "paid") return "paid" as const
  return settlement.loads.length || settlement.adjustments.length
    ? ("to_pay" as const)
    : ("none" as const)
}

/** One line of the statement: a label, an optional detail, and an amount. */
function Line({
  label,
  detail,
  amount,
  href,
  onRemove,
  pending,
}: {
  label: React.ReactNode
  detail?: React.ReactNode
  amount: React.ReactNode
  href?: string
  onRemove?: () => void
  pending?: boolean
}) {
  return (
    <li className="flex items-center gap-3 px-6 py-2.5">
      <div className="min-w-0 flex-1">
        {href ? (
          <Link href={href} className="font-medium hover:underline">
            {label}
          </Link>
        ) : (
          <span className="font-medium">{label}</span>
        )}
        {detail && (
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        )}
      </div>
      <span className="text-sm tabular-nums">{amount}</span>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Remove"
          disabled={pending}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      )}
    </li>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="border-t">
      <p className="bg-muted/40 px-6 py-2 text-xs font-medium text-muted-foreground">
        {title}
      </p>
      <ul className="divide-y">{children}</ul>
    </div>
  )
}

const money = (value: number) => (
  <span className={cn(value < 0 && "text-destructive")}>
    {formatRate(value)}
  </span>
)

/**
 * A driver's pay for one week on their page: the loads, money owed back
 * and adjustments, with arrows to other weeks and a way to mark it paid.
 */
export function DriverPay({
  organizationId,
  settlement,
  today,
  loadsBase,
  prevHref,
  nextHref,
}: {
  organizationId: string
  settlement: Settlement
  /** "YYYY-MM-DD", the default paid-on date. */
  today: string
  /** /org/<slug>/loads */
  loadsBase: string
  prevHref: string
  /** Null on the current week. */
  nextHref: string | null
}) {
  const [paidOn, setPaidOn] = useState(today)
  const [direction, setDirection] = useState<"add" | "deduct">("deduct")
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [pending, start] = useTransition()
  const paid = settlement.status === "paid"
  const { totals } = settlement
  const status = payStatus(settlement)
  const reference = new Map(settlement.loads.map((l) => [l.id, l.reference]))
  const nav = buttonVariants({ variant: "outline", size: "icon-sm" })

  const run = (
    action: () => Promise<{ error: string } | { ok: true }>,
    done?: string,
    after?: () => void
  ) =>
    start(async () => {
      const result = await action()
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      if (done) toast.success(done)
      after?.()
    })

  return (
    <SettingsCard
      id="pay"
      className="scroll-mt-6"
      title="Pay statement"
      description={
        paid && settlement.paid_on
          ? `${formatWeek(settlement.week)} · paid ${formatStopDate(settlement.paid_on)}`
          : formatWeek(settlement.week)
      }
      action={
        <div className="flex shrink-0 items-center gap-2">
          <PayStatusBadge status={status} />
          <Link
            href={prevHref}
            scroll={false}
            className={nav}
            aria-label="Previous week"
          >
            <ChevronLeft />
          </Link>
          {nextHref ? (
            <Link
              href={nextHref}
              scroll={false}
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
      contentClassName="px-0 pb-0"
      footer={
        <SettingsCardFooter
          hint={
            !paid && totals.unpriced > 0 ? (
              <span className="text-destructive">
                Add miles to {totals.unpriced}{" "}
                {totals.unpriced === 1 ? "load" : "loads"} before paying.
              </span>
            ) : (
              <span className="text-foreground">
                Net pay{" "}
                <span className="font-semibold tabular-nums">
                  {formatRate(totals.net)}
                </span>
              </span>
            )
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
            status === "to_pay" && (
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
                  disabled={pending || totals.unpriced > 0}
                  onClick={() =>
                    run(
                      () =>
                        markPaid(
                          organizationId,
                          settlement.driver.id,
                          settlement.week,
                          paidOn
                        ),
                      "Marked paid."
                    )
                  }
                >
                  {pending && <Loader2 className="animate-spin" />}
                  Mark paid
                </Button>
              </>
            )
          )}
        </SettingsCardFooter>
      }
    >
      <Section title={`Loads · ${formatRate(totals.gross)}`}>
        {settlement.loads.length === 0 && (
          <li className="px-6 py-2.5 text-sm text-muted-foreground">
            No loads delivered this week.
          </li>
        )}
        {settlement.loads.map((load) => (
          <Line
            key={load.id}
            label={load.reference}
            href={`${loadsBase}/${load.id}`}
            detail={`${formatStopDate(load.delivery_start)} · ${load.route}${load.miles ? ` · ${load.miles} mi` : ""}`}
            amount={
              load.pay === null ? (
                <span className="text-destructive">Needs miles</span>
              ) : (
                formatRate(load.pay)
              )
            }
          />
        ))}
      </Section>

      {settlement.expenses.length > 0 && (
        <Section title={`Owed back · ${formatRate(totals.reimbursements)}`}>
          {settlement.expenses.map((expense) => (
            <Line
              key={expense.id}
              label={
                EXPENSE_LABELS[expense.kind as ExpenseKind] ?? expense.kind
              }
              detail={[reference.get(expense.load_id), expense.note]
                .filter(Boolean)
                .join(" · ")}
              amount={formatRate(expense.amount)}
            />
          ))}
        </Section>
      )}

      {(settlement.adjustments.length > 0 || !paid) && (
        <Section title={`Adjustments · ${formatRate(totals.adjustments)}`}>
          {settlement.adjustments.map((adjustment) => (
            <Line
              key={adjustment.id}
              label={adjustment.description}
              amount={money(adjustment.amount)}
              pending={pending}
              onRemove={
                paid
                  ? undefined
                  : () =>
                      run(() => removeAdjustment(organizationId, adjustment.id))
              }
            />
          ))}
          {!paid && (
            <li>
              <form
                className="flex flex-wrap items-center gap-2 px-6 py-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  run(
                    () =>
                      addAdjustment(
                        organizationId,
                        settlement.driver.id,
                        settlement.week,
                        { description, amount, direction }
                      ),
                    undefined,
                    () => {
                      setDescription("")
                      setAmount("")
                    }
                  )
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
                      : "e.g. Safety bonus"
                  }
                  className="h-8 min-w-40 flex-1"
                  value={description}
                  maxLength={200}
                  onChange={(event) => setDescription(event.target.value)}
                />
                <Input
                  aria-label="Amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="h-8 w-24"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={pending || !description.trim() || !amount.trim()}
                >
                  Add
                </Button>
              </form>
            </li>
          )}
        </Section>
      )}
    </SettingsCard>
  )
}
