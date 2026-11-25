"use client"

import { cn } from "cn"
import { format } from "date-fns"
import { FileText, Pencil, Plus, Receipt, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  addAccessorial,
  addLoadExpense,
  removeLoadExpense,
  updateLoadExpense,
} from "@/app/org/[slug]/loads/actions"
import { DateField } from "@/components/drivers/date-field"
import { DocumentLink } from "@/components/loads/document-viewer"
import { LoadTextField } from "@/components/loads/freight-fields"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  formatCurrency,
  handleCurrencyBlur,
  handleCurrencyInput,
  handleCurrencyKeyDown,
} from "@/lib/currency"
import {
  DOCUMENT_TYPES,
  removeLoadFiles,
  uploadLoadFile,
} from "@/lib/load-document-upload"
import {
  EXPENSE_KINDS,
  EXPENSE_LABELS,
  type ExpenseKind,
  type ExpenseReceipt,
  expenseSchema,
  expenseTotals,
  type PaidBy,
} from "@/lib/load-expense-format"
import type { LoadExpense } from "@/lib/load-expenses"
import { formatRate } from "@/lib/load-format"

// Calendar dates, printed as UTC so the server and browser agree.
const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})
const formatDay = (day: string) =>
  dayFormat.format(new Date(`${day}T00:00:00Z`))

/** Add or change one expense. Lives in the dialog, so it starts fresh each time. */
function ExpenseForm({
  organizationId,
  loadId,
  expense,
  onDone,
}: {
  organizationId: string
  loadId: string
  /** The expense being changed, or null to add one. */
  expense: LoadExpense | null
  onDone: () => void
}) {
  const [kind, setKind] = useState<ExpenseKind>(expense?.kind ?? "fuel")
  const [paidBy, setPaidBy] = useState<PaidBy>(expense?.paid_by ?? "company")
  const [file, setFile] = useState<File | null>(null)
  const [dropReceipt, setDropReceipt] = useState(false)

  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    expenseSchema,
    async (values) => {
      // Upload a new receipt first, so the expense points at a real file.
      let receipt: ExpenseReceipt | null | undefined = dropReceipt
        ? null
        : undefined
      if (file) {
        const uploaded = await uploadLoadFile(
          organizationId,
          loadId,
          "receipt",
          file
        )
        if ("error" in uploaded) {
          return uploaded.error
        }
        receipt = {
          path: uploaded.path,
          name: uploaded.name,
          type: uploaded.type,
        }
      }
      const result = expense
        ? await updateLoadExpense(organizationId, expense.id, values, receipt)
        : await addLoadExpense(organizationId, loadId, values, receipt ?? null)
      if ("error" in result) {
        if (receipt) {
          await removeLoadFiles([receipt.path]).catch(() => {})
        }
        return result.error
      }
      toast.success(
        `${EXPENSE_LABELS[values.kind]} ${expense ? "updated" : "added"}.`
      )
      onDone()
    }
  )

  const hasReceipt = !!expense?.receipt_name && !dropReceipt

  return (
    <form {...formProps} autoComplete="off">
      <fieldset disabled={pending} className="flex flex-col gap-5">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="paid_by" value={paidBy} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="expense-kind">For</FieldLabel>
            <Select
              value={kind}
              onValueChange={(value) =>
                setKind((value as ExpenseKind) ?? "fuel")
              }
              items={EXPENSE_KINDS.map((value) => ({
                value,
                label: EXPENSE_LABELS[value],
              }))}
            >
              <SelectTrigger id="expense-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {EXPENSE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <LoadTextField
            name="amount"
            label="Amount"
            prefix="$"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={
              expense ? formatCurrency(Number(expense.amount).toFixed(2)) : ""
            }
            errors={errors}
            onChange={handleCurrencyInput}
            onKeyDown={handleCurrencyKeyDown}
            onBlur={handleCurrencyBlur}
            autoFocus
          />
          <DateField
            id="expense-spent-on"
            name="spent_on"
            label="Date"
            defaultValue={expense?.spent_on ?? format(new Date(), "yyyy-MM-dd")}
            errors={errors.spent_on}
            onUpdate={revalidate}
          />
          <Field>
            <FieldLabel>Paid by</FieldLabel>
            <ToggleGroup
              aria-label="Who paid"
              variant="outline"
              size="sm"
              spacing={0}
              className="w-full"
              value={[paidBy]}
              onValueChange={(value: string[]) =>
                value[0] && setPaidBy(value[0] as PaidBy)
              }
            >
              <ToggleGroupItem value="company" className="flex-1">
                Company
              </ToggleGroupItem>
              <ToggleGroupItem value="driver" className="flex-1">
                Driver
              </ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              {paidBy === "driver"
                ? "Out of the driver's pocket, so it's owed back to them."
                : "On the company card or account."}
            </FieldDescription>
          </Field>
          <LoadTextField
            name="note"
            label="Note"
            placeholder="Optional, e.g. Pilot #412, 118 gal"
            defaultValue={expense?.note ?? ""}
            errors={errors}
            className="sm:col-span-2"
          />
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="expense-receipt">Receipt</FieldLabel>
            {hasReceipt && !file ? (
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{expense?.receipt_name}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setDropReceipt(true)}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <input
                id="expense-receipt"
                type="file"
                accept={DOCUMENT_TYPES.join(",")}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted"
                onChange={(event) =>
                  setFile(event.currentTarget.files?.[0] ?? null)
                }
              />
            )}
            <FieldDescription>
              Optional. A photo or PDF, up to 20 MB.
            </FieldDescription>
          </Field>
        </div>
        <DialogFooter className="items-center">
          {formError && (
            <p className="mr-auto text-sm text-destructive">{formError}</p>
          )}
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : expense ? "Save" : "Add expense"}
          </Button>
        </DialogFooter>
      </fieldset>
    </form>
  )
}

/**
 * What running the load cost, receipt by receipt. Feeds the profit in the
 * Money card, and keeps what the driver paid out of pocket so it can be paid
 * back on their settlement.
 */
export function LoadExpensesCard({
  organizationId,
  loadId,
  expenses,
  hasLumperCharge,
}: {
  organizationId: string
  loadId: string
  expenses: LoadExpense[]
  /** Whether the broker is already billed for a lumper. */
  hasLumperCharge: boolean
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<LoadExpense | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const { total, owedToDriver } = expenseTotals(expenses)
  const lumpers = expenses.filter((expense) => expense.kind === "lumper")
  const lumperTotal = expenseTotals(lumpers).total

  function edit(expense: LoadExpense | null) {
    setEditing(expense)
    setOpen(true)
  }

  async function remove(expense: LoadExpense) {
    setBusy(expense.id)
    const result = await removeLoadExpense(organizationId, expense.id)
    setBusy(null)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(`${EXPENSE_LABELS[expense.kind]} removed.`)
    }
  }

  // A person chooses to bill the lumper back; the amount comes from the receipts.
  async function billLumper() {
    setBusy("lumper")
    const result = await addAccessorial(organizationId, loadId, {
      kind: "lumper",
      description: "From the lumper receipt",
      amount: lumperTotal,
    })
    setBusy(null)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(`Lumper ${formatRate(lumperTotal)} added to the charges.`)
    }
  }

  return (
    <SettingsCard
      title="Expenses"
      description="Fuel, tolls, lumper and other costs on this trip."
      action={
        <Button variant="outline" size="sm" onClick={() => edit(null)}>
          <Plus />
          Add expense
        </Button>
      }
      contentClassName={expenses.length ? "px-0 pb-0" : undefined}
      footer={
        expenses.length > 0 && (
          <SettingsCardFooter
            hint={
              owedToDriver > 0
                ? `${formatRate(owedToDriver)} paid by the driver, owed back on their settlement.`
                : "All paid by the company."
            }
          >
            <span className="text-sm">
              <span className="text-muted-foreground">Total </span>
              <span className="font-semibold tabular-nums">
                {formatRate(total)}
              </span>
            </span>
          </SettingsCardFooter>
        )
      }
    >
      {expenses.length === 0 ? (
        <SettingsEmptyState icon={Receipt} title="No expenses yet">
          Add receipts as they come in. They come off the load&apos;s profit.
        </SettingsEmptyState>
      ) : (
        <>
          {lumpers.length > 0 && !hasLumperCharge && (
            <div className="mx-6 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-500/10 px-4 py-3 text-sm">
              <span>
                A {formatRate(lumperTotal)} lumper was paid but isn&apos;t
                billed to the broker.
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={billLumper}
              >
                Bill it as a charge
              </Button>
            </div>
          )}
          <ul className="divide-y border-t">
            {expenses.map((expense) => (
              <li
                key={expense.id}
                className="flex items-center justify-between gap-3 px-6 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {EXPENSE_LABELS[expense.kind]}
                    {expense.note && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {expense.note}
                      </span>
                    )}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                    <span>{formatDay(expense.spent_on)}</span>
                    {expense.paid_by === "driver" && (
                      <span className="rounded-4xl bg-amber-500/15 px-2 text-xs font-medium text-amber-800 dark:text-amber-200">
                        Driver paid
                      </span>
                    )}
                    {expense.receipt_url ? (
                      <DocumentLink
                        file={{
                          url: expense.receipt_url,
                          name: expense.receipt_name ?? "Receipt",
                          type: expense.receipt_type ?? "image/webp",
                        }}
                        label="Receipt"
                      />
                    ) : (
                      <span className="text-xs">No receipt</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="mr-2 font-medium tabular-nums">
                    {formatRate(expense.amount)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${EXPENSE_LABELS[expense.kind].toLowerCase()}`}
                    disabled={busy !== null}
                    onClick={() => edit(expense)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${EXPENSE_LABELS[expense.kind].toLowerCase()}`}
                    disabled={busy !== null}
                    onClick={() => remove(expense)}
                    className={cn(busy === expense.id && "opacity-50")}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit expense" : "Add an expense"}
            </DialogTitle>
            <DialogDescription>
              What it was for, how much, and who paid. Attach the receipt if you
              have it.
            </DialogDescription>
          </DialogHeader>
          <ExpenseForm
            // A new form each time, so it starts from this expense.
            key={editing?.id ?? "new"}
            organizationId={organizationId}
            loadId={loadId}
            expense={editing}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </SettingsCard>
  )
}
