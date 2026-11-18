"use client"

import { cn } from "cn"
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  applyRateToUpcomingLoads,
  updateDriverPay,
} from "@/app/org/[slug]/drivers/actions"
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
import { PayFields } from "@/components/drivers/pay-fields"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { EXPENSE_LABELS, type ExpenseKind } from "@/lib/load-expense-format"
import { formatRate, formatStopDate } from "@/lib/load-format"
import { formatWeek } from "@/lib/settlement-format"
import type { PayType } from "@/lib/schemas/driver"
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

/** The rate, with a button that turns it into the fields to change it. */
function RateRow({
  organizationId,
  driverId,
  type,
  rate,
  label,
}: {
  organizationId: string
  driverId: string
  type: PayType | null
  rate: number | null
  /** "$0.65 / mile", or null when not set. */
  label: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-4 px-6 pb-5">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Rate</p>
          <p
            className={cn(
              "text-xl font-semibold tracking-tight tabular-nums",
              !label && "text-muted-foreground"
            )}
          >
            {label ?? "Not set"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil />
          {label ? "Change" : "Set rate"}
        </Button>
      </div>
    )
  }

  return (
    <form
      className="mx-6 mb-5 grid gap-5 rounded-lg border bg-muted/30 p-4 sm:grid-cols-6"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        start(async () => {
          const result = await updateDriverPay(organizationId, driverId, {
            pay_type: String(data.get("pay_type") ?? ""),
            pay_rate: String(data.get("pay_rate") ?? ""),
          })
          if ("error" in result) {
            setError(result.error)
            return
          }
          toast.success("Pay rate saved.")
          setError(null)
          setEditing(false)
        })
      }}
    >
      <PayFields
        defaultType={type}
        defaultRate={rate}
        errors={error ? { pay_rate: [{ message: error }] } : {}}
        onUpdate={() => setError(null)}
      />
      <div className="flex items-end justify-end gap-2 sm:col-span-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null)
            setEditing(false)
          }}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save rate
        </Button>
      </div>
    </form>
  )
}

/** Booked loads still locked at an older rate, with a button to move them. */
function RateNotice({
  organizationId,
  driverId,
  currentRate,
  stale,
}: {
  organizationId: string
  driverId: string
  currentRate: string
  stale: { reference: string; locked: string }[]
}) {
  const [pending, start] = useTransition()
  const count = stale.length
  const rates = [...new Set(stale.map((load) => load.locked))]

  return (
    <div className="mx-6 mb-5 flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">
          {count} upcoming {count === 1 ? "load is" : "loads are"} still at{" "}
          {rates.join(" or ")}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {stale.map((load) => load.reference).join(", ")}. Loads in transit,
          delivered or invoiced keep their rate.
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await applyRateToUpcomingLoads(
              organizationId,
              driverId
            )
            if ("error" in result) {
              toast.error(result.error)
              return
            }
            toast.success(
              result.changed === 0
                ? "Those loads are already on the current rate."
                : `${result.changed} upcoming ${result.changed === 1 ? "load" : "loads"} now ${result.changed === 1 ? "pays" : "pay"} ${currentRate}.`
            )
          })
        }
      >
        <RefreshCw className={pending ? "animate-spin" : undefined} />
        Apply {currentRate}
      </Button>
    </div>
  )
}

/** One figure in the week's totals. */
function Total({
  label,
  value,
  strong,
}: {
  label: string
  value: number
  strong?: boolean
}) {
  return (
    <div className="px-6 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tabular-nums",
          strong ? "text-lg font-semibold" : "font-medium",
          value < 0 && "text-destructive"
        )}
      >
        {formatRate(value)}
      </p>
    </div>
  )
}

/**
 * Everything about a driver's pay in one card: their rate (and loads still
 * on an older one), then one week's statement with its loads, money owed
 * back and adjustments, arrows to other weeks and a way to mark it paid.
 */
export function DriverPay({
  organizationId,
  driverId,
  payType,
  payRate,
  rateLabel,
  stale,
  settlement,
  today,
  loadsBase,
  prevHref,
  nextHref,
}: {
  organizationId: string
  driverId: string
  payType: PayType | null
  payRate: number | null
  /** "$0.65 / mile", or null when not set. */
  rateLabel: string | null
  /** Booked loads locked at a rate other than the current one. */
  stale: { reference: string; locked: string }[]
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
      title="Pay"
      description="Their rate, and what they're owed each week."
      contentClassName="px-0 pb-0"
      footer={
        <SettingsCardFooter
          hint={
            !paid && totals.unpriced > 0 ? (
              <span className="text-destructive">
                Add miles to {totals.unpriced}{" "}
                {totals.unpriced === 1 ? "load" : "loads"} before paying.
              </span>
            ) : paid && settlement.paid_on ? (
              `Paid ${formatStopDate(settlement.paid_on)}.`
            ) : status === "none" ? (
              "Nothing to pay this week."
            ) : (
              "Pick the date it was paid, then mark it paid."
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
                  Mark {formatRate(totals.net)} paid
                </Button>
              </>
            )
          )}
        </SettingsCardFooter>
      }
    >
      <RateRow
        // Starts over when a new rate comes back from the server.
        key={`${payType}:${payRate}`}
        organizationId={organizationId}
        driverId={driverId}
        type={payType}
        rate={payRate}
        label={rateLabel}
      />
      {stale.length > 0 && rateLabel && (
        <RateNotice
          organizationId={organizationId}
          driverId={driverId}
          currentRate={rateLabel}
          stale={stale}
        />
      )}

      {/* The week: which one, where it stands, and its totals. */}
      <div className="flex items-center justify-between gap-3 border-t px-6 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h5 className="truncate font-medium">
            {formatWeek(settlement.week)}
          </h5>
          <PayStatusBadge status={status} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
      </div>
      <div className="grid grid-cols-2 border-t sm:grid-cols-4 [&>*]:border-border sm:[&>*+*]:border-l max-sm:[&>*:nth-child(even)]:border-l max-sm:[&>*:nth-child(n+3)]:border-t">
        <Total label="Loads" value={totals.gross} />
        <Total label="Owed back" value={totals.reimbursements} />
        <Total label="Adjustments" value={totals.adjustments} />
        <Total label="Net pay" value={totals.net} strong />
      </div>

      <Section title="Loads">
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
        <Section title="Owed back">
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
        <Section title="Adjustments">
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
