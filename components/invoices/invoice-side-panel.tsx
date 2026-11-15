"use client"

import { cn } from "cn"
import {
  Ban,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Trash2,
  Wallet,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"

import {
  deleteInvoiceDraft,
  emailInvoice,
  markInvoiceSent,
  recordInvoicePayment,
  updateInvoiceDraft,
  voidInvoice,
} from "@/app/org/[slug]/invoices/actions"
import { DateField } from "@/components/drivers/date-field"
import { LoadTextField } from "@/components/loads/freight-fields"
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
  handleCurrencyBlur,
  handleCurrencyInput,
  handleCurrencyKeyDown,
} from "@/lib/currency"
import {
  type BillTo,
  daysBetween,
  formatInvoiceDate,
  formatTerms,
  type InvoiceState,
  SENT_VIA_LABELS,
} from "@/lib/invoice-format"
import type { Invoice } from "@/lib/invoices"
import { formatRate } from "@/lib/load-format"
import {
  emailInvoiceSchema,
  invoiceDraftSchema,
  paymentSchema,
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
      const result = await emailInvoice(organizationId, invoice.id, values)
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

function PaymentForm({
  organizationId,
  invoice,
  total,
  today,
  onDone,
}: {
  organizationId: string
  invoice: Invoice
  total: number
  today: string
  onDone: () => void
}) {
  const formRef = useRef<HTMLFormElement>(null)
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
      toast.success(`Invoice ${invoice.number} marked paid.`)
      onDone()
    }
  )

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
        />
        <LoadTextField
          name="amount"
          label="Amount paid"
          prefix="$"
          inputMode="decimal"
          defaultValue={total.toFixed(2)}
          errors={errors}
          hint={
            invoice.factored
              ? "What the factoring company funded, or what the broker paid them."
              : "Less than the total if it was short-paid or a quick-pay fee came off."
          }
          onChange={handleCurrencyInput}
          onKeyDown={handleCurrencyKeyDown}
          onBlur={handleCurrencyBlur}
        />
        <LoadTextField
          name="reference"
          label="Check or ACH number"
          placeholder="Optional"
          errors={errors}
        />
        <DialogFooter className="items-center">
          {formError && (
            <p className="mr-auto text-sm text-destructive">{formError}</p>
          )}
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Mark paid"}
          </Button>
        </DialogFooter>
      </fieldset>
    </form>
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
          hint="From the broker's payment terms. 0 is due on receipt."
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
 * Beside the invoice: what to do with it next, what's in the packet, and
 * the draft's terms and notes.
 */
export function InvoiceSidePanel({
  organizationId,
  invoice,
  state,
  total,
  dueOn,
  billTo,
  packet,
  packetHref,
  invoicesBase,
  today,
}: {
  organizationId: string
  invoice: Invoice
  state: InvoiceState
  total: number
  /** "YYYY-MM-DD": when it's due, or would be if sent today. */
  dueOn: string
  billTo: BillTo
  packet: PacketItem[]
  /** /org/<slug>/invoices/<id>/packet */
  packetHref: string
  /** /org/<slug>/invoices */
  invoicesBase: string
  today: string
}) {
  const router = useRouter()
  const [paying, setPaying] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [emailInstead, setEmailInstead] = useState(false)

  const missing = packet.filter((item) => item.required && item.files === 0)
  const portal = billTo.method === "portal" && !emailInstead

  async function markSent(via: "portal" | "other") {
    setBusy(via)
    const result = await markInvoiceSent(organizationId, invoice.id, { via })
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

  const daysLate = daysBetween(dueOn, today)

  return (
    <div className="flex flex-col gap-4">
      {/* Next step */}
      <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
        <div className="px-5 pt-4 pb-5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {invoice.status === "draft" ? "Next step" : "Status"}
          </p>
          {invoice.status === "draft" && (
            <>
              <h4 className="mt-1 text-lg font-semibold tracking-tight">
                {portal
                  ? `Upload it to ${billTo.name}'s portal`
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
                  : "Waiting for payment"}
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {invoice.sent_via ? SENT_VIA_LABELS[invoice.sent_via] : "Sent"}
                {invoice.sent_at &&
                  ` on ${formatInvoiceDate(invoice.invoice_date ?? invoice.sent_at)}`}
                {invoice.sent_to.length > 0 &&
                  ` to ${invoice.sent_to.join(", ")}`}
                . Due {formatInvoiceDate(dueOn)}.
                {invoice.factored &&
                  " Factored: the broker pays your factoring company."}
              </p>
              <Button
                size="lg"
                className="mt-4 w-full"
                onClick={() => setPaying(true)}
              >
                <Wallet />
                Record payment
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
                {formatRate(invoice.paid_amount ?? 0)} on{" "}
                {invoice.paid_on && formatInvoiceDate(invoice.paid_on)}
                {invoice.payment_reference &&
                  `, ref ${invoice.payment_reference}`}
                .
                {invoice.paid_amount !== null &&
                  Number(invoice.paid_amount) < total &&
                  ` Short ${formatRate(total - Number(invoice.paid_amount))}.`}
              </p>
            </>
          )}

          {invoice.status === "void" && (
            <>
              <h4 className="mt-1 text-lg font-semibold tracking-tight">
                Voided
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {invoice.void_reason}
                {invoice.voided_at &&
                  ` (${formatInvoiceDate(invoice.voided_at)})`}
              </p>
            </>
          )}
        </div>
      </section>

      {/* Packet */}
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

      {invoice.status === "draft" ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setDeleting(true)}
        >
          <Trash2 />
          Delete draft
        </Button>
      ) : invoice.status !== "void" ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setVoiding(true)}
        >
          <Ban />
          Void invoice
        </Button>
      ) : null}

      <Dialog open={paying} onOpenChange={setPaying}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Record payment for invoice {invoice.number}
            </DialogTitle>
            <DialogDescription>
              {invoice.factored
                ? "The load stays factored. This records that the money came in."
                : "The load moves to paid."}
            </DialogDescription>
          </DialogHeader>
          <PaymentForm
            organizationId={organizationId}
            invoice={invoice}
            total={total}
            today={today}
            onDone={() => setPaying(false)}
          />
        </DialogContent>
      </Dialog>

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
