"use client"

import { cn } from "cn"
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MinusCircle,
  Package,
  Plus,
  PlusCircle,
  Receipt,
  Trash2,
} from "lucide-react"
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
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
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
import { DatePicker } from "@/components/ui/date-picker"
import { EXPENSE_LABELS, type ExpenseKind } from "@/lib/load-expense-format"
import { formatRate, formatStopDate } from "@/lib/load-format"
import { formatPeriod } from "@/lib/settlement-format"
import type { Settlement } from "@/lib/settlements"

/** Paid, to pay, or nothing to pay, for a driver's pay period. */
export function PayStatusBadge({
  status,
}: {
  status: "paid" | "to_pay" | "none"
}) {
  return (
    <span
      className={cn(
        // The same pill as the qualification file's badges.
        "inline-flex h-6 w-fit shrink-0 items-center rounded-4xl px-2.5 text-xs font-medium whitespace-nowrap",
        status === "paid"
          ? "bg-brand/10 text-brand-ink"
          : status === "to_pay"
            ? "bg-amber-500/15 text-amber-800"
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

const money = (value: number) => (
  <span className={cn(value < 0 && "text-destructive")}>
    {formatRate(value)}
  </span>
)

/** What each line of the statement is, for the Type column and its tile. */
const KINDS = {
  load: {
    label: "Load",
    icon: Package,
    tile: "bg-muted text-muted-foreground",
  },
  expense: {
    label: "Owed back",
    icon: Receipt,
    tile: "bg-sky-500/10 text-sky-700",
  },
  add: {
    label: "Adjustment",
    icon: PlusCircle,
    tile: "bg-brand/10 text-brand",
  },
  deduct: {
    label: "Adjustment",
    icon: MinusCircle,
    tile: "bg-destructive/10 text-destructive",
  },
} as const

/** One line of the statement, whatever it is. */
type Line = {
  key: string
  kind: keyof typeof KINDS
  title: string
  href?: string
  detail: string
  amount: React.ReactNode
  /** Adjustments on an unpaid period can be taken back off. */
  remove?: () => void
}

/**
 * The popup for adding to or taking off a period's pay: a bonus, a cash
 * advance, escrow.
 */
function AdjustmentDialog({
  open,
  pending,
  onOpenChange,
  onSave,
}: {
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onSave: (input: {
    direction: "add" | "deduct"
    description: string
    amount: string
  }) => void
}) {
  const [direction, setDirection] = useState<"add" | "deduct">("deduct")
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add an adjustment</DialogTitle>
          <DialogDescription>
            Money added to or taken off this pay period.
          </DialogDescription>
        </DialogHeader>
        <form
          id="pay-adjustment"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSave({ direction, description, amount })
          }}
        >
          <ToggleGroup
            aria-label="Take off or add"
            variant="outline"
            size="sm"
            spacing={1}
            value={[direction]}
            onValueChange={(value: string[]) => {
              if (value[0]) setDirection(value[0] as "add" | "deduct")
            }}
          >
            <ToggleGroupItem value="deduct">Take off</ToggleGroupItem>
            <ToggleGroupItem value="add">Add</ToggleGroupItem>
          </ToggleGroup>
          <Field>
            <FieldLabel htmlFor="adjustment-description">
              What it&apos;s for
            </FieldLabel>
            <Input
              id="adjustment-description"
              required
              autoFocus
              maxLength={200}
              placeholder={
                direction === "deduct"
                  ? "e.g. Cash advance, escrow"
                  : "e.g. Safety bonus"
              }
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="adjustment-amount">Amount</FieldLabel>
            <Input
              id="adjustment-amount"
              required
              inputMode="decimal"
              placeholder="0.00"
              className="w-32"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="pay-adjustment"
            disabled={pending || !description.trim() || !amount.trim()}
          >
            {pending && <Loader2 className="animate-spin" />}
            {direction === "deduct" ? "Take off" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * A driver's pay for one pay period (a week, 2 weeks or a month) on their
 * page, as a table like the
 * Documents card: the loads, money owed back and adjustments, with arrows
 * to other weeks, Add adjustment, and a way to mark it paid.
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
  /** Null on the current period. */
  nextHref: string | null
}) {
  const [paidOn, setPaidOn] = useState(today)
  const [adding, setAdding] = useState(false)
  // A fresh form each time the dialog opens.
  const [dialogKey, setDialogKey] = useState(0)
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

  const lines: Line[] = [
    ...settlement.loads.map((load) => ({
      key: `load-${load.id}`,
      kind: "load" as const,
      title: load.reference,
      href: `${loadsBase}/${load.id}`,
      detail: `${formatStopDate(load.delivered_on ? `${load.delivered_on}T00:00:00` : load.delivery_start)} · ${load.route}${load.tonu ? " · TONU" : load.miles ? ` · ${load.miles} mi` : ""}${load.late ? " · Recorded after that period was paid" : ""}`,
      amount:
        load.pay === null ? (
          <span className="text-destructive">Needs miles</span>
        ) : (
          formatRate(load.pay)
        ),
    })),
    ...settlement.expenses.map((expense) => ({
      key: `expense-${expense.id}`,
      kind: expense.deducted ? ("deduct" as const) : ("expense" as const),
      title: EXPENSE_LABELS[expense.kind as ExpenseKind] ?? expense.kind,
      detail: [
        reference.get(expense.load_id) ?? expense.reference,
        expense.deducted && "Company paid, taken off pay",
        expense.note,
        expense.late && "Turned in after that period was paid",
      ]
        .filter(Boolean)
        .join(" · "),
      amount: expense.deducted
        ? money(expense.amount)
        : formatRate(expense.amount),
    })),
    ...settlement.adjustments.map((adjustment) => ({
      key: `adjustment-${adjustment.id}`,
      kind: adjustment.amount < 0 ? ("deduct" as const) : ("add" as const),
      title: adjustment.description,
      detail: adjustment.amount < 0 ? "Taken off pay" : "Added to pay",
      amount: money(adjustment.amount),
      remove: paid
        ? undefined
        : () =>
            run(
              () => removeAdjustment(organizationId, adjustment.id),
              "Adjustment removed."
            ),
    })),
  ]

  return (
    <SettingsCard
      id="pay"
      // Columns appear as the card gets wider, not the window.
      className="@container scroll-mt-6"
      title="Pay statement"
      description={
        // The period, with arrows to the periods either side of it.
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            {paid && settlement.paid_on
              ? `${formatPeriod(settlement.week, settlement.end)} · paid ${formatStopDate(settlement.paid_on)}`
              : formatPeriod(settlement.week, settlement.end)}
          </span>
          {/* A span: the description is a paragraph, which can't hold a div. */}
          <span className="inline-flex items-center gap-1">
            <Link
              href={prevHref}
              scroll={false}
              className={nav}
              aria-label="Previous period"
            >
              <ChevronLeft />
            </Link>
            {nextHref ? (
              <Link
                href={nextHref}
                scroll={false}
                className={nav}
                aria-label="Next period"
              >
                <ChevronRight />
              </Link>
            ) : (
              <span className={cn(nav, "pointer-events-none opacity-40")}>
                <ChevronRight />
              </span>
            )}
          </span>
        </span>
      }
      action={
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <PayStatusBadge status={status} />
          {!paid && (
            <Button
              variant="outline"
              size="sm"
              aria-label="Add adjustment"
              onClick={() => {
                setDialogKey((key) => key + 1)
                setAdding(true)
              }}
            >
              {/* Short on a phone, where the full label runs off the card. */}
              <Plus /> <span className="sm:hidden">Add</span>
              <span className="hidden sm:inline">Add adjustment</span>
            </Button>
          )}
        </div>
      }
      contentClassName={lines.length ? "px-0 pb-0" : undefined}
      footer={
        <SettingsCardFooter
          hint={
            !paid && totals.unpriced > 0 ? (
              <span className="text-destructive">
                Add miles to {totals.unpriced}{" "}
                {totals.unpriced === 1 ? "load" : "loads"} before paying.
              </span>
            ) : (
              <span>
                <span className="text-foreground">
                  Net pay{" "}
                  <span className="font-semibold tabular-nums">
                    {formatRate(totals.net)}
                  </span>
                </span>
                {lines.length > 0 && (
                  <span className="block text-xs tabular-nums">
                    Loads {formatRate(totals.gross)} · Expenses{" "}
                    {money(totals.reimbursements)} · Adjustments{" "}
                    {formatRate(totals.adjustments)}
                  </span>
                )}
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
                <DatePicker
                  aria-label="Paid on"
                  className="w-40"
                  required
                  value={paidOn}
                  onChange={setPaidOn}
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
      {lines.length === 0 ? (
        <SettingsEmptyState icon={Receipt} title="Nothing this period">
          {paid
            ? "No loads or adjustments were paid this period."
            : "No loads delivered this period. Use Add adjustment for a bonus, an advance or escrow."}
        </SettingsEmptyState>
      ) : (
        <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
          <TableHeader className="bg-muted/40">
            <TableRow>
              {/* The line takes the spare width; the rest fit their contents. */}
              <TableHead className="w-full">Line</TableHead>
              <TableHead className="hidden w-px whitespace-nowrap @lg:table-cell">
                Type
              </TableHead>
              <TableHead className="w-px text-right whitespace-nowrap">
                Amount
              </TableHead>
              <TableHead className="w-px">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => {
              const { label, icon: Icon, tile } = KINDS[line.kind]
              return (
                <TableRow key={line.key}>
                  <TableCell className="max-w-0 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-md",
                          tile
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        {line.href ? (
                          <Link
                            href={line.href}
                            className="block truncate text-sm font-medium hover:underline"
                          >
                            {line.title}
                          </Link>
                        ) : (
                          <p className="truncate text-sm font-medium">
                            {line.title}
                          </p>
                        )}
                        {line.detail && (
                          <p className="truncate text-xs text-muted-foreground">
                            {line.detail}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm whitespace-nowrap text-muted-foreground @lg:table-cell">
                    {label}
                  </TableCell>
                  <TableCell className="text-right text-sm whitespace-nowrap tabular-nums">
                    {line.amount}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      {line.remove ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="hover:text-destructive"
                          aria-label={`Remove ${line.title}`}
                          disabled={pending}
                          onClick={line.remove}
                        >
                          <Trash2 />
                        </Button>
                      ) : (
                        // Keeps the amounts lined up with the rows that
                        // have a remove button.
                        <span className="size-8" aria-hidden />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
      <AdjustmentDialog
        key={dialogKey}
        open={adding}
        pending={pending}
        onOpenChange={setAdding}
        onSave={(input) =>
          run(
            () =>
              addAdjustment(
                organizationId,
                settlement.driver.id,
                settlement.week,
                input
              ),
            input.direction === "deduct"
              ? "Taken off this period's pay."
              : "Added to this period's pay.",
            () => setAdding(false)
          )
        }
      />
    </SettingsCard>
  )
}
