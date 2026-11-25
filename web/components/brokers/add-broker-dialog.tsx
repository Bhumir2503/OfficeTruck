"use client"

import { CornerDownLeft } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { createBroker } from "@/app/org/[slug]/customers/actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useZodForm } from "@/hooks/use-zod-form"
import { formatPhone, handlePhoneInput, handlePhoneKeyDown } from "@/lib/phone"
import {
  brokerSchema,
  CUSTOMER_KIND_LABELS,
  CUSTOMER_KINDS,
  INVOICE_METHOD_LABELS,
  INVOICE_METHODS,
  type CustomerKind,
  type InvoiceMethod,
} from "@/lib/schemas/broker"

/** What's already known about the broker: typed in, from FMCSA, or the rate con. */
export type NewBrokerDefaults = {
  legal_name?: string | null
  dba_name?: string | null
  mc_number?: string | null
  dot_number?: string | null
  phone?: string | null
  address_line1?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  email_domains?: string[]
}

type Errors = Partial<Record<string, { message: string }[]>>

function TextField({
  name,
  label,
  errors,
  hint,
  className,
  suffix,
  ...input
}: {
  name: string
  label: string
  errors: Errors
  hint?: React.ReactNode
  className?: string
  suffix?: string
} & Omit<React.ComponentProps<"input">, "name" | "className">) {
  const id = `new-broker-${name.replaceAll("_", "-")}`
  const fieldErrors = errors[name]
  const control = (
    <Input
      id={id}
      name={name}
      aria-invalid={!!fieldErrors}
      className={suffix ? "pr-14" : undefined}
      {...input}
    />
  )
  return (
    <Field data-invalid={!!fieldErrors} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {suffix ? (
        <div className="relative">
          {control}
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        </div>
      ) : (
        control
      )}
      {fieldErrors ? (
        <FieldError errors={fieldErrors} />
      ) : (
        hint && <FieldDescription>{hint}</FieldDescription>
      )}
    </Field>
  )
}

/** A hidden input for a value kept in state, re-checking the form when it changes. */
function useHiddenValue<T>(
  value: T,
  onUpdate: (form: HTMLFormElement | null) => void
) {
  const ref = useRef<HTMLInputElement>(null)
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onUpdate(ref.current?.form ?? null)
    // Only when the value changes; onUpdate is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return ref
}

const lowercase = (
  event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
) => {
  const input = event.currentTarget
  const lower = input.value.toLowerCase()
  if (lower !== input.value) {
    const { selectionStart, selectionEnd } = input
    input.value = lower
    input.setSelectionRange(selectionStart, selectionEnd)
  }
}

// Lives inside the dialog content, so it starts fresh each time it opens.
function AddBrokerForm({
  organizationId,
  defaults,
  onAdded,
  onCancel,
}: {
  organizationId: string
  defaults: NewBrokerDefaults
  onAdded: (broker: { id: string; name: string }) => void
  onCancel: () => void
}) {
  // From an MC lookup or rate con it's a broker; otherwise ask.
  const [kind, setKind] = useState<CustomerKind>("broker")
  const [method, setMethod] = useState<InvoiceMethod>("email")
  const [factored, setFactored] = useState(false)
  const [noa, setNoa] = useState(false)

  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    brokerSchema,
    async (values) => {
      const result = await createBroker(organizationId, values)
      if ("error" in result) {
        return result.error
      }
      if (result.fmcsaError) {
        toast.warning(
          `${values.legal_name} added, but the FMCSA check didn't run: ${result.fmcsaError}`
        )
      } else {
        toast.success(`${values.legal_name} added to your customers.`)
      }
      onAdded({ id: result.id, name: values.dba_name ?? values.legal_name })
    }
  )

  const kindRef = useHiddenValue(kind, revalidate)
  const methodRef = useHiddenValue(method, revalidate)
  const factoredRef = useHiddenValue(factored, revalidate)
  const noaRef = useHiddenValue(noa, revalidate)

  return (
    <form
      {...formProps}
      autoComplete="off"
      // The dialog sits inside the load form in React's tree, so its events
      // would otherwise reach the load form too.
      onSubmit={(event) => {
        event.stopPropagation()
        void formProps.onSubmit(event)
      }}
      onChange={(event) => {
        event.stopPropagation()
        formProps.onChange(event)
      }}
      className="min-h-0"
    >
      <input ref={kindRef} type="hidden" name="kind" value={kind} />
      <input
        ref={methodRef}
        type="hidden"
        name="invoice_method"
        value={method}
      />
      <input
        ref={factoredRef}
        type="hidden"
        name="factored"
        value={String(factored)}
      />
      <input
        ref={noaRef}
        type="hidden"
        name="noa_on_file"
        value={String(factored && noa)}
      />
      {/* From FMCSA, saved with the broker; changed on the broker page. */}
      {(
        ["dot_number", "address_line1", "city", "state", "postal_code"] as const
      ).map((field) => (
        <input
          key={field}
          type="hidden"
          name={field}
          value={defaults[field] ?? ""}
        />
      ))}
      <fieldset disabled={pending} className="flex flex-col gap-6">
        <div className="-m-1 flex max-h-[70vh] flex-col gap-6 overflow-y-auto p-1">
          <ToggleGroup
            aria-label="Customer type"
            variant="outline"
            size="sm"
            spacing={1}
            value={[kind]}
            onValueChange={(value: string[]) => {
              if (value[0]) setKind(value[0] as CustomerKind)
            }}
          >
            {CUSTOMER_KINDS.map((key) => (
              <ToggleGroupItem key={key} value={key}>
                {CUSTOMER_KIND_LABELS[key]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {/* Who they are. */}
          <div className="grid gap-5 sm:grid-cols-6">
            <TextField
              name="legal_name"
              label="Legal name"
              defaultValue={defaults.legal_name ?? undefined}
              placeholder="e.g. Total Quality Logistics, LLC"
              errors={errors}
              className="sm:col-span-4"
            />
            <TextField
              name="dba_name"
              label="DBA name"
              defaultValue={defaults.dba_name ?? undefined}
              placeholder="Optional, e.g. TQL"
              errors={errors}
              className="sm:col-span-2"
            />
            {kind === "broker" && (
              <TextField
                name="mc_number"
                label="MC number"
                inputMode="numeric"
                defaultValue={defaults.mc_number ?? undefined}
                placeholder="e.g. 411443"
                errors={errors}
                className="sm:col-span-2"
              />
            )}
            <TextField
              name="phone"
              label="Main phone"
              type="tel"
              defaultValue={
                defaults.phone ? formatPhone(defaults.phone) : undefined
              }
              placeholder="(800) 555-0100"
              errors={errors}
              className="sm:col-span-2"
              onChange={handlePhoneInput}
              onKeyDown={handlePhoneKeyDown}
            />
            <TextField
              name="email_domains"
              label="Email domains"
              defaultValue={defaults.email_domains?.join(", ")}
              placeholder="e.g. tql.com"
              errors={errors}
              className="sm:col-span-2"
              onChange={lowercase}
            />
          </div>

          {/* How they pay. */}
          <div className="grid gap-5 border-t pt-5 sm:grid-cols-12">
            <Field
              data-invalid={!!errors.invoice_method}
              className="sm:col-span-6"
            >
              <FieldLabel id="new-broker-invoice-method-label">
                How they take invoices
              </FieldLabel>
              <ToggleGroup
                aria-labelledby="new-broker-invoice-method-label"
                variant="outline"
                size="sm"
                spacing={1}
                className="flex-wrap"
                value={[method]}
                onValueChange={(value: string[]) => {
                  if (value[0]) setMethod(value[0] as InvoiceMethod)
                }}
              >
                {INVOICE_METHODS.map((value) => (
                  <ToggleGroupItem key={value} value={value}>
                    {INVOICE_METHOD_LABELS[value]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <div className="flex flex-col justify-end gap-3 sm:col-span-6">
              <Label className="flex items-center gap-3 font-normal">
                <Checkbox
                  checked={factored}
                  onCheckedChange={(checked) => setFactored(checked === true)}
                />
                We factor this broker&apos;s loads
              </Label>
              {factored && (
                <Label className="flex items-center gap-3 font-normal">
                  <Checkbox
                    checked={noa}
                    onCheckedChange={(checked) => setNoa(checked === true)}
                  />
                  The NOA is on file with the broker
                </Label>
              )}
            </div>
            {method === "portal" && (
              <TextField
                name="portal_url"
                label="Portal address"
                placeholder="https://"
                errors={errors}
                className="sm:col-span-12"
              />
            )}
            <TextField
              name="billing_emails"
              label={
                method === "portal"
                  ? "Billing emails (optional)"
                  : "Billing emails"
              }
              placeholder="carrierinvoices@tql.com, ap@tql.com"
              errors={errors}
              className="sm:col-span-6"
              onChange={lowercase}
            />
            <TextField
              name="payment_terms_days"
              label="Payment terms"
              inputMode="numeric"
              suffix="days"
              defaultValue={30}
              errors={errors}
              className="sm:col-span-3"
            />
            <TextField
              name="quick_pay_fee_percent"
              label="Quick-pay fee"
              inputMode="decimal"
              suffix="%"
              placeholder="e.g. 2.5"
              errors={errors}
              className="sm:col-span-3"
            />
          </div>
        </div>

        <DialogFooter className="items-center">
          {formError && (
            <p className="mr-auto text-sm text-destructive">{formError}</p>
          )}
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add customer"} <CornerDownLeft />
          </Button>
        </DialogFooter>
      </fieldset>
    </form>
  )
}

/**
 * Adds a broker to your list without leaving the load: the details needed
 * to book and bill them. Contacts, notes and the rest go on the broker page.
 */
export function AddBrokerDialog({
  open,
  onOpenChange,
  organizationId,
  defaults,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  defaults: NewBrokerDefaults
  onAdded: (broker: { id: string; name: string }) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add a customer</DialogTitle>
          <DialogDescription>
            Saved once, picked from the list on every load after this. Contacts
            and notes go on the broker&apos;s page.
          </DialogDescription>
        </DialogHeader>
        <AddBrokerForm
          organizationId={organizationId}
          defaults={defaults}
          onAdded={(broker) => {
            onOpenChange(false)
            onAdded(broker)
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
