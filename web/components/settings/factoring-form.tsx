"use client"

import { CornerDownLeft } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { saveFactoringCompany } from "@/app/org/[slug]/settings/factoring/actions"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useZodForm } from "@/hooks/use-zod-form"
import type { FactoringCompany } from "@/lib/factoring-format"
import { formatPhone, handlePhoneInput, handlePhoneKeyDown } from "@/lib/phone"
import {
  factoringCompanySchema,
  INVOICE_METHODS,
  type FactoringCompanyInput,
  type InvoiceMethod,
} from "@/lib/schemas/broker"

type Name = keyof FactoringCompanyInput
type Errors = Partial<Record<Name, { message: string }[]>>

const METHOD_LABELS: Record<InvoiceMethod, string> = {
  email: "Email",
  portal: "Their portal (manual upload)",
}

function TextField({
  name,
  label,
  errors,
  hint,
  className,
  ...input
}: {
  name: Name
  label: string
  errors: Errors
  hint?: React.ReactNode
  className?: string
} & Omit<React.ComponentProps<"input">, "name" | "className">) {
  const id = `factoring-${name.replaceAll("_", "-")}`
  const fieldErrors = errors[name]
  return (
    <Field data-invalid={!!fieldErrors} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} aria-invalid={!!fieldErrors} {...input} />
      {fieldErrors ? (
        <FieldError errors={fieldErrors} />
      ) : (
        hint && <FieldDescription>{hint}</FieldDescription>
      )}
    </Field>
  )
}

/** Letters only, uppercased: "tx" → "TX". */
function handleStateInput(event: React.ChangeEvent<HTMLInputElement>) {
  const input = event.currentTarget
  const cleaned = input.value
    .replace(/[^a-z]/gi, "")
    .toUpperCase()
    .slice(0, 2)
  if (cleaned !== input.value) input.value = cleaned
}

/** Lowercase as you type, for email addresses. */
function handleLowercase(event: React.ChangeEvent<HTMLTextAreaElement>) {
  const input = event.currentTarget
  const lower = input.value.toLowerCase()
  if (lower !== input.value) {
    const { selectionStart, selectionEnd } = input
    input.value = lower
    input.setSelectionRange(selectionStart, selectionEnd)
  }
}

/**
 * The organization's factoring company: where packets for factored loads go
 * and where brokers send payment. Owners and admins can edit it; members see
 * it read-only.
 */
export function FactoringForm({
  organizationId,
  company,
  canEdit,
}: {
  organizationId: string
  company: FactoringCompany | null
  canEdit: boolean
}) {
  const [method, setMethod] = useState<InvoiceMethod>(
    company?.submission_method ?? "email"
  )
  const methodRef = useRef<HTMLInputElement>(null)
  const firstRender = useRef(true)

  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    factoringCompanySchema,
    async (values) => {
      const result = await saveFactoringCompany(organizationId, values)
      if ("error" in result) {
        return result.error
      }
      toast.success(
        company ? "Factoring company saved." : `${values.name} set up.`
      )
    }
  )

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    revalidate(methodRef.current?.form ?? null)
    // Only when the method changes; revalidate is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method])

  const footer = (
    <SettingsCardFooter
      hint={
        formError ? (
          <span className="text-destructive">{formError}</span>
        ) : canEdit ? (
          "Used on every broker you mark as factored."
        ) : (
          "Only owners and admins can change this."
        )
      }
    >
      {canEdit && (
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : company ? "Save changes" : "Save"}{" "}
          <CornerDownLeft />
        </Button>
      )}
    </SettingsCardFooter>
  )

  return (
    <form {...formProps} autoComplete="off">
      <input
        ref={methodRef}
        type="hidden"
        name="submission_method"
        value={method}
      />
      <fieldset disabled={pending || !canEdit} className="flex flex-col gap-6">
        <SettingsCard
          title="Company"
          description="Who you sell your invoices to."
          contentClassName="grid gap-5 sm:grid-cols-6"
        >
          <TextField
            name="name"
            label="Name"
            placeholder="e.g. RTS Financial"
            defaultValue={company?.name}
            errors={errors}
            className="sm:col-span-3"
          />
          <TextField
            name="phone"
            label="Phone"
            type="tel"
            placeholder="(555) 123-4567"
            defaultValue={
              company?.phone ? formatPhone(company.phone) : undefined
            }
            errors={errors}
            className="sm:col-span-3"
            onChange={handlePhoneInput}
            onKeyDown={handlePhoneKeyDown}
          />
        </SettingsCard>

        <SettingsCard
          title="Invoice packets"
          description="Where packets for factored loads go, instead of to the broker."
          contentClassName="grid gap-5 sm:grid-cols-6"
        >
          <Field className="sm:col-span-6">
            <FieldLabel id="factoring-method-label">
              How they take them
            </FieldLabel>
            <ToggleGroup
              aria-labelledby="factoring-method-label"
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
                  {METHOD_LABELS[value]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription>
              {method === "portal"
                ? "You'll upload packets yourself. The app marks them for manual upload and never says it sent them."
                : "Packets are emailed to the addresses below."}
            </FieldDescription>
          </Field>
          {method === "portal" && (
            <TextField
              name="portal_url"
              label="Portal address"
              placeholder="https://"
              defaultValue={company?.portal_url ?? undefined}
              errors={errors}
              className="sm:col-span-6"
            />
          )}
          <Field
            data-invalid={!!errors.submission_emails}
            className="sm:col-span-6"
          >
            <FieldLabel htmlFor="factoring-submission-emails">
              Submission emails
              {method === "portal" && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  (optional)
                </span>
              )}
            </FieldLabel>
            <Textarea
              id="factoring-submission-emails"
              name="submission_emails"
              rows={2}
              placeholder="invoices@factoringcompany.com"
              defaultValue={company?.submission_emails.join("\n")}
              aria-invalid={!!errors.submission_emails}
              onChange={handleLowercase}
            />
            {errors.submission_emails ? (
              <FieldError errors={errors.submission_emails} />
            ) : (
              <FieldDescription>
                One per line, or separated by commas.
              </FieldDescription>
            )}
          </Field>
        </SettingsCard>

        <SettingsCard
          title="Remit-to address"
          description="Where brokers send payment for factored loads. It goes on the invoice and the notice of assignment."
          contentClassName="grid gap-5 sm:grid-cols-6"
        >
          <TextField
            name="remit_line1"
            label="Street address or PO box"
            defaultValue={company?.remit_line1 ?? undefined}
            errors={errors}
            className="sm:col-span-6"
          />
          <TextField
            name="remit_line2"
            label="Suite or department"
            defaultValue={company?.remit_line2 ?? undefined}
            errors={errors}
            className="sm:col-span-6"
          />
          <TextField
            name="remit_city"
            label="City"
            defaultValue={company?.remit_city ?? undefined}
            errors={errors}
            className="sm:col-span-3"
          />
          <TextField
            name="remit_state"
            label="State"
            placeholder="TX"
            defaultValue={company?.remit_state ?? undefined}
            errors={errors}
            className="sm:col-span-1"
            onChange={handleStateInput}
          />
          <TextField
            name="remit_postal_code"
            label="ZIP code"
            inputMode="numeric"
            defaultValue={company?.remit_postal_code ?? undefined}
            errors={errors}
            className="sm:col-span-2"
          />
        </SettingsCard>

        <SettingsCard title="Notes" footer={footer}>
          <Field data-invalid={!!errors.notes}>
            <FieldLabel htmlFor="factoring-notes" className="sr-only">
              Notes
            </FieldLabel>
            <Textarea
              id="factoring-notes"
              name="notes"
              rows={3}
              placeholder="Account number, advance rate, rep's name…"
              defaultValue={company?.notes ?? undefined}
              aria-invalid={!!errors.notes}
            />
            <FieldError errors={errors.notes} />
          </Field>
        </SettingsCard>
      </fieldset>
    </form>
  )
}
