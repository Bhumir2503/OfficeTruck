"use client"

import { cn } from "cn"
import {
  Ban,
  BellRing,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  FileText,
  History,
  Loader2,
  Mail,
  Trash2,
  Undo2,
  Wallet,
  Zap,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"

import {
  deleteInvoiceDraft,
  emailInvoice,
  markInvoiceSent,
  recordInvoicePayment,
  sendInvoiceReminder,
  undoInvoicePayment,
  updateInvoiceDraft,
  voidInvoice,
} from "@/app/org/[slug]/invoices/actions"
import { DateField } from "@/components/drivers/date-field"
import { LoadTextField } from "@/components/loads/freight-fields"
import { PastInvoiceDialog } from "@/components/invoices/past-invoice-dialog"
import { LocalDate } from "@/components/local-date"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  formatCurrency,
  handleCurrencyBlur,
  handleCurrencyInput,
  handleCurrencyKeyDown,
} from "@/lib/currency"
import { possessive } from "@/lib/text-format"
import {
  balanceDue,
  type BillTo,
  daysBetween,
  formatInvoiceDate,
  formatTerms,
  type InvoiceState,
  localToday,
  SENT_VIA_LABELS,
} from "@/lib/invoice-format"
import type { Invoice, InvoicePayment } from "@/lib/invoices"
import { formatRate } from "@/lib/load-format"
import {
  emailInvoiceSchema,
  invoiceDraftSchema,
  paymentSchema,
  reminderSchema,
  voidInvoiceSchema,
} from "@/lib/schemas/invoice"

export type PacketItem = {
  label: string
  /** How many files of it go in. */
  files: number
  /** Needed before the load is ready to bill. */
  required: boolean
}

function Panel({
  title,
  aside,
  children,
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <h4 className="font-semibold">{title}</h4>
        {aside}
      </div>
      <div className="px-5 pt-3 pb-4">{children}</div>
    </section>
  )
}

function FormError({ message }: { message: string | null }) {
  return message ? (
    <p className="text-sm text-destructive" role="alert">
      {message}
    </p>
  ) : null
}

function EmailForm({
  organizationId,
  invoice,
  billTo,
}: {
  organizationId: string
  invoice: Invoice
  billTo: BillTo
}) {
  const { errors, formError, pending, formProps } = useZodForm(
    emailInvoiceSchema,
    async (values) => {
      const result = await emailInvoice(organizationId, invoice.id, {
        ...values,
        sent_on: localToday(),
      })
      if ("error" in result) {
        return result.error
      }
      toast.success(
        `Invoice ${invoice.number} emailed to ${values.to.join(", ")}.`
      )
    }
  )

  return (
    <form {...formProps} className="flex flex-col gap-4">
      <fieldset disabled={pending} className="flex flex-col gap-4">
        <Field data-invalid={!!errors.to}>
          <FieldLabel htmlFor="invoice-to">Send to</FieldLabel>
          <Textarea
            id="invoice-to"
            name="to"
            rows={2}
            defaultValue={billTo.emails.join("\n")}
            placeholder="billing@broker.com"
            aria-invalid={!!errors.to}
          />
          {errors.to ? (
            <FieldError errors={errors.to} />
          ) : (
            <p className="text-xs text-muted-foreground">
              {billTo.emails.length
                ? `From ${billTo.kind === "factoring" ? "the factoring company's" : "the broker's"} billing emails. One per line.`
                : "No billing email on file. One per line."}
            </p>
          )}
        </Field>
        <Field data-invalid={!!errors.message}>
          <FieldLabel htmlFor="invoice-message">Message</FieldLabel>
          <Textarea
            id="invoice-message"
            name="message"
            rows={2}
            maxLength={2000}
            placeholder="Optional. Shown above the invoice details."
          />
          <FieldError errors={errors.message} />
        </Field>
        <FormError message={formError} />
        <Button type="submit" size="lg" className="w-full">
          {pending ? <Loader2 className="animate-spin" /> : <Mail />}
          {pending ? "Sending…" : "Email invoice packet"}
        </Button>
      </fieldset>
    </form>
  )
}

/**
 * A reminder about an unpaid invoice: emails the packet again with the
 * balance and how late it is. Opens as a short form from its own card.
 */
function ReminderCard({
  organizationId,
  invoice,
  billTo,
  overdue,
}: {
  organizationId: string
  invoice: Invoice
  billTo: BillTo
  overdue: boolean
}) {
  const [open, setOpen] = useState(false)
  const { errors, formError, pending, formProps } = useZodForm(
    reminderSchema,
    async (values) => {
      const result = await sendInvoiceReminder(
        organizationId,
        invoice.id,
        values
      )
      if ("error" in result) {
        return result.error
      }
      toast.success(`Reminder sent to ${values.to.join(", ")}.`)
      setOpen(false)
    }
  )
  // Back to whoever it went to, or the billing emails on file.
  const recipients = invoice.sent_to.length ? invoice.sent_to : billTo.emails

  return (
    <Panel title={overdue ? "Chase payment" : "Send a reminder"}>
      <p className="text-sm text-muted-foreground">
        {invoice.last_reminded_at
          ? `Last reminder ${formatInvoiceDate(invoice.last_reminded_at)}${invoice.reminder_count > 1 ? `, ${invoice.reminder_count} sent so far` : ""}.`
          : overdue
            ? "It's past due. Email them a reminder with the packet attached again."
            : "Email them a reminder with the packet attached again."}
      </p>
      {open ? (
        <form {...formProps} className="mt-3 flex flex-col gap-3">
          <fieldset disabled={pending} className="flex flex-col gap-3">
            <Field data-invalid={!!errors.to}>
              <FieldLabel htmlFor="reminder-to">Send to</FieldLabel>
              <Textarea
                id="reminder-to"
                name="to"
                rows={2}
                defaultValue={recipients.join("\n")}
                placeholder="billing@broker.com"
                aria-invalid={!!errors.to}
              />
              <FieldError errors={errors.to} />
            </Field>
            <Field data-invalid={!!errors.message}>
              <FieldLabel htmlFor="reminder-message">Message</FieldLabel>
              <Textarea
                id="reminder-message"
                name="message"
                rows={2}
                maxLength={2000}
                placeholder="Optional, e.g. Can you share an ETA on payment?"
              />
              <FieldError errors={errors.message} />
            </Field>
            <FormError message={formError} />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" className="flex-1">
                {pending ? <Loader2 className="animate-spin" /> : <BellRing />}
                {pending ? "Sending…" : "Send reminder"}
              </Button>
            </div>
          </fieldset>
        </form>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={() => setOpen(true)}
        >
          <BellRing />
          Send reminder
        </Button>
      )}
    </Panel>
  )
}

function PaymentForm({
  organizationId,
  invoice,
  balance,
  quickPayPercent,
  today,
  onDone,
}: {
  organizationId: string
  invoice: Invoice
  /** What's still owed; the amount starts here. */
  balance: number
  /** The broker's quick-pay fee; offers a one-tap quick-pay amount. */
  quickPayPercent: number | null
  today: string
  onDone: () => void
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [amount, setAmount] = useState(balance)
  const [closeOut, setCloseOut] = useState(false)
  // Quick pay is the broker paying early less their fee; a factored invoice
  // is paid by the factoring company instead.
  const fee = invoice.factored ? null : quickPayPercent
  const quickPay =
    fee && fee > 0 ? Math.round(balance * (100 - fee)) / 100 : null

  function applyQuickPay() {
    if (quickPay === null) return
    const input = formRef.current?.elements.namedItem("amount")
    if (input instanceof HTMLInputElement) {
      input.value = formatCurrency(quickPay.toFixed(2))
    }
    setAmount(quickPay)
    setCloseOut(true)
    revalidate(formRef.current)
  }
  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    paymentSchema,
    async (values) => {
      const result = await recordInvoicePayment(
        organizationId,
        invoice.id,
        values
      )
      if ("error" in result) {
        return result.error
      }
      const paid = values.amount ?? 0
      const left = balanceDue(balance, paid)
      toast.success(
        left === 0 || values.close_out
          ? `Invoice ${invoice.number} paid.`
          : `${formatRate(paid)} recorded. ${formatRate(left)} still owed on invoice ${invoice.number}.`
      )
      onDone()
    }
  )
  const short = amount > 0 && amount < balance

  return (
    <form ref={formRef} {...formProps} autoComplete="off">
      <fieldset disabled={pending} className="flex flex-col gap-5">
        <DateField
          id="payment-date"
          name="paid_on"
          label="Paid on"
          defaultValue={today}
          errors={errors.paid_on}
          onUpdate={() => revalidate(formRef.current)}
          // Not before the invoice was sent, and not in the future.
          min={invoice.invoice_date ?? undefined}
          max={today}
        />
        <LoadTextField
          name="amount"
          label="Amount paid"
          prefix="$"
          inputMode="decimal"
          defaultValue={balance.toFixed(2)}
          errors={errors}
          hint={
            invoice.factored
              ? "What the factoring company funded, or what the broker paid them."
              : `${formatRate(balance)} is still owed. Enter less if they paid part of it.`
          }
          onChange={(event) => {
            handleCurrencyInput(event)
            setAmount(
              Number(event.currentTarget.value.replace(/[$,\s]/g, "")) || 0
            )
          }}
          onKeyDown={handleCurrencyKeyDown}
          onBlur={handleCurrencyBlur}
        />
        {quickPay !== null && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="-mt-2 self-start"
            onClick={applyQuickPay}
          >
            <Zap />
            Quick pay: {formatRate(quickPay)} after their {fee}% fee
          </Button>
        )}
        <LoadTextField
          name="reference"
          label="Check or ACH number"
          placeholder="Optional"
          errors={errors}
        />
        {short && (
          <label className="flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              name="close_out"
              checked={closeOut}
              onChange={(event) => setCloseOut(event.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              <span className="font-medium">No more is coming</span>
              <span className="block text-muted-foreground">
                Mark it paid anyway, {formatRate(balance - amount)} short
                {closeOut && quickPay === amount ? " (the quick-pay fee)" : ""}.
                Leave this off to keep it open for the rest.
              </span>
            </span>
          </label>
        )}
        <DialogFooter className="items-center">
          {formError && (
            <p className="mr-auto text-sm text-destructive">{formError}</p>
          )}
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Record payment"}
          </Button>
        </DialogFooter>
      </fieldset>
    </form>
  )
}

/** The Record payment popup, from the invoice page or a row in the list. */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  organizationId,
  invoice,
  balance,
  quickPayPercent,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  invoice: Invoice
  /** What's still owed. */
  balance: number
  /** The broker's quick-pay fee, if they offer quick pay. */
  quickPayPercent: number | null
  /** "YYYY-MM-DD" */
  today: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment for invoice {invoice.number}</DialogTitle>
          <DialogDescription>
            {invoice.factored
              ? "The load stays factored. This records that the money came in."
              : "Once it's paid in full, the load moves to paid."}
          </DialogDescription>
        </DialogHeader>
        <PaymentForm
          organizationId={organizationId}
          invoice={invoice}
          balance={balance}
          quickPayPercent={quickPayPercent}
          today={today}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function VoidForm({
  organizationId,
  invoice,
  onDone,
}: {
  organizationId: string
  invoice: Invoice
  onDone: () => void
}) {
  const { errors, formError, pending, formProps } = useZodForm(
    voidInvoiceSchema,
    async (values) => {
      const result = await voidInvoice(organizationId, invoice.id, values)
      if ("error" in result) {
        return result.error
      }
      toast.success(
        `Invoice ${invoice.number} voided. The load is back to delivered, ready to bill again.`
      )
      onDone()
    }
  )

  return (
    <form {...formProps}>
      <fieldset disabled={pending} className="flex flex-col gap-5">
        <Field data-invalid={!!errors.reason}>
          <FieldLabel htmlFor="void-reason">Reason</FieldLabel>
          <Textarea
            id="void-reason"
            name="reason"
            rows={3}
            autoFocus
            maxLength={500}
            placeholder="e.g. Wrong amount, sending a corrected invoice"
            aria-invalid={!!errors.reason}
          />
          <FieldError errors={errors.reason} />
        </Field>
        <DialogFooter className="items-center">
          {formError && (
            <p className="mr-auto text-sm text-destructive">{formError}</p>
          )}
          <Button type="button" variant="outline" onClick={onDone}>
            Keep invoice
          </Button>
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? "Voiding…" : "Void invoice"}
          </Button>
        </DialogFooter>
      </fieldset>
    </form>
  )
}

function DraftForm({
  organizationId,
  invoice,
}: {
  organizationId: string
  invoice: Invoice
}) {
  const { errors, formError, pending, formProps } = useZodForm(
    invoiceDraftSchema,
    async (values) => {
      const result = await updateInvoiceDraft(
        organizationId,
        invoice.id,
        values
      )
      if ("error" in result) {
        return result.error
      }
      toast.success("Invoice updated.")
    }
  )

  return (
    <form {...formProps} autoComplete="off">
      <fieldset disabled={pending} className="flex flex-col gap-4">
        <LoadTextField
          name="terms_days"
          label="Terms (days to pay)"
          inputMode="numeric"
          defaultValue={String(invoice.terms_days)}
          errors={errors}
          hint="From the broker's payment terms."
        />
        <Field data-invalid={!!errors.notes}>
          <FieldLabel htmlFor="invoice-notes">Notes on the invoice</FieldLabel>
          <Textarea
            id="invoice-notes"
            name="notes"
            rows={3}
            maxLength={1000}
            defaultValue={invoice.notes ?? ""}
            placeholder="Optional, e.g. Detention approved by Sam on 11/14"
            aria-invalid={!!errors.notes}
          />
          <FieldError errors={errors.notes} />
        </Field>
        <FormError message={formError} />
        <Button type="submit" variant="outline" className="w-full">
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </fieldset>
    </form>
  )
}

/**
 * Beside the invoice: the one thing to do with it next (send it, record the
 * payment) or where it stands, then deleting the draft or voiding it.
 */
export function InvoiceSidePanel({
  organizationId,
  invoice,
  state,
  total,
  dueOn,
  billTo,
  missing,
  packetHref,
  invoicesBase,
  payments,
  noaMissing,
  brokerName,
  quickPayPercent,
  today,
}: {
  organizationId: string
  invoice: Invoice
  state: InvoiceState
  total: number
  /** "YYYY-MM-DD": when it's due, or would be if sent today. */
  dueOn: string
  billTo: BillTo
  /** Required documents the packet is still missing. */
  missing: PacketItem[]
  /** /org/<slug>/invoices/<id>/packet */
  packetHref: string
  /** /org/<slug>/invoices, where deleting a draft goes back to. */
  invoicesBase: string
  /** Payments in, oldest first. */
  payments: InvoicePayment[]
  /** A factored broker with no notice of assignment on file. */
  noaMissing: boolean
  brokerName: string
  /** The broker's quick-pay fee, if they offer quick pay. */
  quickPayPercent: number | null
  today: string
}) {
  const router = useRouter()
  const [paying, setPaying] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [emailInstead, setEmailInstead] = useState(false)
  const [recordingPast, setRecordingPast] = useState(false)

  const portal = billTo.method === "portal" && !emailInstead

  async function markSent(via: "portal" | "other") {
    setBusy(via)
    const result = await markInvoiceSent(organizationId, invoice.id, {
      via,
      sent_on: localToday(),
    })
    setBusy(null)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(`Invoice ${invoice.number} marked sent.`)
    }
  }

  async function remove() {
    setBusy("delete")
    const result = await deleteInvoiceDraft(organizationId, invoice.id)
    if ("error" in result) {
      setBusy(null)
      toast.error(result.error)
      return
    }
    toast.success(`Draft invoice ${invoice.number} deleted.`)
    router.push(invoicesBase)
  }

  async function undo(payment: InvoicePayment) {
    setBusy(`undo:${payment.id}`)
    const result = await undoInvoicePayment(organizationId, payment.id)
    setBusy(null)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(
        `${formatRate(payment.amount)} payment undone. Invoice ${invoice.number} is open again.`
      )
    }
  }

  const daysLate = daysBetween(dueOn, today)
  const received = Number(invoice.paid_amount ?? 0)
  const balance = balanceDue(total, received)
  const lastPayment = payments.at(-1)

  // Total, paid and what's left, with each payment and a way to take it back.
  const ledger = payments.length > 0 && (
    <div className="mt-4 border-t pt-3">
      <ul className="flex flex-col gap-1.5">
        {payments.map((payment) => (
          <li
            key={payment.id}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="min-w-0 truncate text-muted-foreground">
              {formatInvoiceDate(payment.paid_on)}
              {payment.reference && ` · ${payment.reference}`}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <span className="tabular-nums">{formatRate(payment.amount)}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Undo the ${formatRate(payment.amount)} payment from ${formatInvoiceDate(payment.paid_on)}`}
                title="Undo this payment"
                disabled={busy !== null}
                onClick={() => void undo(payment)}
              >
                {busy === `undo:${payment.id}` ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Undo2 />
                )}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 flex flex-col gap-1 border-t pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Invoice total</dt>
          <dd className="tabular-nums">{formatRate(total)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Paid</dt>
          <dd className="tabular-nums">{formatRate(received)}</dd>
        </div>
        <div className="flex justify-between font-semibold">
          <dt>
            {invoice.status === "paid" && balance > 0
              ? "Written off"
              : "Still owed"}
          </dt>
          <dd className="tabular-nums">{formatRate(balance)}</dd>
        </div>
      </dl>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
        <div className="px-5 pt-4 pb-5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {invoice.status === "draft" ? "Next step" : "Status"}
          </p>
          {invoice.status === "draft" && (
            <>
              <h4 className="mt-1 text-lg font-semibold tracking-tight">
                {portal
                  ? `Upload it to ${possessive(billTo.name)} portal`
                  : `Send it to ${billTo.name}`}
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {billTo.kind === "factoring"
                  ? "This broker's loads are factored, so the packet goes to your factoring company. "
                  : ""}
                {portal
                  ? "Download the packet, upload it there, then mark it uploaded. "
                  : "The packet goes as one PDF: the invoice, then the rate con, BOL and POD. "}
                It&apos;s due {formatInvoiceDate(dueOn)} if sent today (
                {formatTerms(invoice.terms_days).toLowerCase()}).
              </p>
              {missing.length > 0 && (
                <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                  Missing the {missing.map((item) => item.label).join(", ")}.
                  Brokers usually won&apos;t pay without it. Upload it on the
                  load first.
                </p>
              )}
              {noaMissing && billTo.kind === "factoring" && (
                <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                  There&apos;s no notice of assignment on file for {brokerName}.
                  Send them {billTo.name}&apos;s NOA first, or they may pay you
                  instead, and {billTo.name} won&apos;t be paid. Mark it on file
                  on the broker once it&apos;s sent.
                </p>
              )}
              <div className="mt-4 flex flex-col gap-2">
                {portal ? (
                  <>
                    <a
                      href={`${packetHref}?download=1`}
                      className={buttonVariants({
                        size: "lg",
                        className: "w-full",
                      })}
                    >
                      <Download />
                      Download packet
                    </a>
                    {billTo.portal_url && (
                      <a
                        href={billTo.portal_url}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonVariants({
                          variant: "outline",
                          className: "w-full",
                        })}
                      >
                        <ExternalLink />
                        Open their portal
                      </a>
                    )}
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={busy !== null}
                      onClick={() => void markSent("portal")}
                    >
                      {busy === "portal" && (
                        <Loader2 className="animate-spin" />
                      )}
                      Mark uploaded
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEmailInstead(true)}
                    >
                      Email it instead
                    </Button>
                  </>
                ) : (
                  <>
                    <EmailForm
                      organizationId={organizationId}
                      invoice={invoice}
                      billTo={billTo}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void markSent("other")}
                    >
                      {busy === "other" && <Loader2 className="animate-spin" />}
                      Sent it another way? Mark it sent
                    </Button>
                  </>
                )}
              </div>
            </>
          )}

          {invoice.status === "sent" && (
            <>
              <h4
                className={cn(
                  "mt-1 text-lg font-semibold tracking-tight",
                  state === "overdue" && "text-destructive"
                )}
              >
                {state === "overdue"
                  ? `Overdue ${daysLate} ${daysLate === 1 ? "day" : "days"}`
                  : state === "partial"
                    ? `Partly paid · ${formatRate(balance)} left`
                    : "Waiting for payment"}
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {invoice.sent_via ? SENT_VIA_LABELS[invoice.sent_via] : "Sent"}
                {/* The invoice date, or the moment it was sent, on the
                    viewer's day. */}
                {invoice.sent_at && (
                  <>
                    {" on "}
                    {invoice.invoice_date ? (
                      formatInvoiceDate(invoice.invoice_date)
                    ) : (
                      <LocalDate value={invoice.sent_at} />
                    )}
                  </>
                )}
                {invoice.sent_to.length > 0 &&
                  ` to ${invoice.sent_to.join(", ")}`}
                . Due {formatInvoiceDate(dueOn)}.
                {invoice.factored &&
                  " Factored: the broker pays your factoring company."}
              </p>
              {ledger}
              <Button
                size="lg"
                className="mt-4 w-full"
                onClick={() => setPaying(true)}
              >
                <Wallet />
                {payments.length ? "Record another payment" : "Record payment"}
              </Button>
            </>
          )}

          {invoice.status === "paid" && (
            <>
              <h4 className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight">
                <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
                Paid
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {balance > 0
                  ? `Closed out ${formatRate(balance)} short`
                  : "Paid in full"}
                {invoice.paid_on && ` on ${formatInvoiceDate(invoice.paid_on)}`}
                {payments.length > 1 && `, in ${payments.length} payments`}.
              </p>
              {ledger}
            </>
          )}

          {invoice.status === "void" && (
            <>
              <h4 className="mt-1 text-lg font-semibold tracking-tight">
                Voided
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {invoice.void_reason}
                {invoice.voided_at && (
                  <>
                    {" ("}
                    <LocalDate value={invoice.voided_at} />)
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </section>

      {invoice.status === "draft" && (
        <Panel title="Sent before OfficeTruck?">
          <p className="text-sm text-muted-foreground">
            Record the day it really went out, without sending anything, so its
            due date and payments line up.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => setRecordingPast(true)}
          >
            <History />
            Record as sent earlier
          </Button>
          <PastInvoiceDialog
            organizationId={organizationId}
            invoiceId={invoice.id}
            number={invoice.number}
            today={today}
            earliest={null}
            open={recordingPast}
            onOpenChange={(next) => {
              setRecordingPast(next)
              if (!next) router.refresh()
            }}
          />
        </Panel>
      )}

      {invoice.status === "draft" && (
        <Panel title="Delete draft">
          <p className="text-sm text-muted-foreground">
            The load goes back to Ready to invoice. Number {invoice.number}{" "}
            won&apos;t be used again.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full text-destructive hover:text-destructive"
            onClick={() => setDeleting(true)}
          >
            <Trash2 />
            Delete draft
          </Button>
        </Panel>
      )}

      {invoice.status === "sent" && (
        <ReminderCard
          organizationId={organizationId}
          invoice={invoice}
          billTo={billTo}
          overdue={state === "overdue"}
        />
      )}

      {invoice.status === "paid" && lastPayment && (
        <Panel title="Undo payment">
          <p className="text-sm text-muted-foreground">
            Recorded by mistake? Takes back the {formatRate(lastPayment.amount)}{" "}
            from {formatInvoiceDate(lastPayment.paid_on)}, and the invoice is
            open again.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            disabled={busy !== null}
            onClick={() => void undo(lastPayment)}
          >
            {busy === `undo:${lastPayment.id}` ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Undo2 />
            )}
            Undo payment
          </Button>
        </Panel>
      )}

      {invoice.status === "sent" && payments.length === 0 && (
        <Panel title="Void invoice">
          <p className="text-sm text-muted-foreground">
            For a mistake. It stays on record as void, and the load goes back to
            delivered so you can bill it again.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full text-destructive hover:text-destructive"
            onClick={() => setVoiding(true)}
          >
            <Ban />
            Void invoice
          </Button>
        </Panel>
      )}

      <RecordPaymentDialog
        open={paying}
        onOpenChange={setPaying}
        organizationId={organizationId}
        invoice={invoice}
        balance={balance}
        quickPayPercent={quickPayPercent}
        today={today}
      />

      <Dialog open={voiding} onOpenChange={setVoiding}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Void invoice {invoice.number}?</DialogTitle>
            <DialogDescription>
              It stays on record as void, and the load goes back to delivered so
              you can bill it again with a new invoice. Let the broker know
              it&apos;s been replaced.
            </DialogDescription>
          </DialogHeader>
          <VoidForm
            organizationId={organizationId}
            invoice={invoice}
            onDone={() => setVoiding(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete draft invoice {invoice.number}?</DialogTitle>
            <DialogDescription>
              The load goes back to Ready to invoice. Number {invoice.number}{" "}
              won&apos;t be used again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(false)}>
              Keep draft
            </Button>
            <Button
              variant="destructive"
              disabled={busy === "delete"}
              onClick={() => void remove()}
            >
              {busy === "delete" ? "Deleting…" : "Delete draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Under the invoice: what goes out with it, and the draft's terms and notes.
 */
export function InvoiceDetails({
  organizationId,
  invoice,
  packet,
  packetHref,
}: {
  organizationId: string
  invoice: Invoice
  packet: PacketItem[]
  /** /org/<slug>/invoices/<id>/packet */
  packetHref: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "grid items-start gap-4",
          invoice.status === "draft" && "md:grid-cols-2"
        )}
      >
        <Panel title="Packet">
          <ul className="flex flex-col divide-y">
            <li className="flex items-center gap-2 py-2 text-sm first:pt-0">
              <FileText className="size-4 text-muted-foreground" />
              <span className="font-medium">Invoice {invoice.number}</span>
            </li>
            {packet.map((item) => (
              <li
                key={item.label}
                className="flex items-center justify-between gap-3 py-2 text-sm last:pb-0"
              >
                <span className="flex items-center gap-2">
                  {item.files ? (
                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground" />
                  )}
                  <span
                    className={cn(
                      "font-medium",
                      !item.files && "text-muted-foreground"
                    )}
                  >
                    {item.label}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {item.files > 1
                    ? `${item.files} files`
                    : item.files
                      ? "Attached"
                      : item.required
                        ? "Missing"
                        : "None"}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a
              href={packetHref}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLink />
              View
            </a>
            <a
              href={`${packetHref}?download=1`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download />
              Download
            </a>
          </div>
        </Panel>

        {invoice.status === "draft" && (
          <Panel title="Terms and notes">
            <DraftForm organizationId={organizationId} invoice={invoice} />
          </Panel>
        )}
      </div>
    </div>
  )
}
