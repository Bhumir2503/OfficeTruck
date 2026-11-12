"use client"

import { CornerDownLeft, Search } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  createBroker,
  lookupMc,
  updateBroker,
  type McLookup,
} from "@/app/org/[slug]/brokers/actions"
import { FlagBadge } from "@/components/brokers/broker-badges"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useZodForm } from "@/hooks/use-zod-form"
import { fmcsaFlags } from "@/lib/broker-format"
import type { Broker } from "@/lib/brokers"
import type { FmcsaRecord } from "@/lib/fmcsa"
import {
  brokerSchema,
  INVOICE_METHODS,
  INVOICE_METHOD_LABELS,
  type BrokerInput,
  type InvoiceMethod,
} from "@/lib/schemas/broker"

type Name = keyof BrokerInput
type Errors = Partial<Record<Name, { message: string }[]>>

/** What the fields start with: the broker being edited, or an FMCSA lookup. */
type Defaults = Partial<
  Pick<
    Broker,
    | "legal_name"
    | "dba_name"
    | "mc_number"
    | "dot_number"
    | "address_line1"
    | "address_line2"
    | "city"
    | "state"
    | "postal_code"
  >
>

const fieldId = (name: Name) => `broker-${name.replaceAll("_", "-")}`

function TextField({
  name,
  label,
  errors,
  hint,
  className,
  suffix,
  ...input
}: {
  name: Name
  label: string
  errors: Errors
  hint?: React.ReactNode
  className?: string
  suffix?: string
} & Omit<React.ComponentProps<"input">, "name" | "className">) {
  const id = fieldId(name)
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

/** Digits only, as you type, after dropping an "MC" or "DOT" prefix. */
function digitsOnly(maxLength: number) {
  return (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const cleaned = input.value
      .replace(/^\s*(MC|US\s*DOT|DOT)[-#\s]*/i, "")
      .replace(/\D/g, "")
      .slice(0, maxLength)
    if (cleaned !== input.value) {
      input.value = cleaned
    }
  }
}

/** Lowercase as you type: email domains and addresses. */
function handleLowercase(
  event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
) {
  const input = event.currentTarget
  const lower = input.value.toLowerCase()
  if (lower !== input.value) {
    const { selectionStart, selectionEnd } = input
    input.value = lower
    input.setSelectionRange(selectionStart, selectionEnd)
  }
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

/** A hidden input that tells the form's validation when its value changes. */
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

/** Looks a broker up by MC number before filling in the form. */
function McLookupCard({
  organizationId,
  base,
  onFound,
}: {
  organizationId: string
  base: string
  onFound: (record: FmcsaRecord | null, mc: string) => void
}) {
  const [mc, setMc] = useState("")
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<McLookup | null>(null)

  async function lookUp() {
    setPending(true)
    const next = await lookupMc(organizationId, mc)
    setPending(false)
    setResult(next)
    if ("ok" in next && !next.existing) {
      onFound(next.fmcsa, mc.replace(/\D/g, ""))
    }
  }

  const flags = result && "ok" in result ? fmcsaFlags(result.fmcsa) : []

  return (
    <SettingsCard
      title="Look up by MC number"
      description="Checks whether you already have this broker, and fills in what FMCSA has on file."
      footer={
        <SettingsCardFooter
          hint={
            !result ? (
              "Or skip this and fill in the form yourself."
            ) : "error" in result ? (
              <span className="text-destructive">{result.error}</span>
            ) : result.existing ? (
              <span>
                You already have this broker:{" "}
                <Link
                  href={`${base}/${result.existing.id}`}
                  className="font-medium text-foreground underline"
                >
                  {result.existing.legal_name}
                </Link>
              </span>
            ) : result.fmcsa ? (
              <span>
                Filled in from FMCSA: {result.fmcsa.legal_name ?? "no name"}.
                {result.fmcsaError && ` (Saved copy; ${result.fmcsaError})`}
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-300">
                {result.fmcsaError ?? "Nothing found."} Fill in the form
                yourself.
              </span>
            )
          }
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || mc.trim() === ""}
            onClick={lookUp}
          >
            <Search />
            {pending ? "Looking up…" : "Look up"}
          </Button>
        </SettingsCardFooter>
      }
    >
      <div className="flex flex-col gap-3">
        <Field className="max-w-xs">
          <FieldLabel htmlFor="broker-lookup-mc">MC number</FieldLabel>
          <Input
            id="broker-lookup-mc"
            inputMode="numeric"
            placeholder="e.g. 411443"
            value={mc}
            onChange={(event) => {
              digitsOnly(8)(event)
              setMc(event.currentTarget.value)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                if (mc.trim()) void lookUp()
              }
            }}
          />
        </Field>
        {flags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {flags.map((flag) => (
              <FlagBadge key={flag.key} flag={flag} />
            ))}
          </div>
        )}
      </div>
    </SettingsCard>
  )
}

/**
 * The fields for a broker. With `broker` it edits that broker and stays on
 * the page; without, it starts with an MC lookup, adds a new broker and
 * opens its page.
 */
export function BrokerForm({
  organizationId,
  base,
  broker,
}: {
  organizationId: string
  /** /org/<slug>/brokers */
  base: string
  broker?: Broker
}) {
  const router = useRouter()
  const [defaults, setDefaults] = useState<Defaults>(broker ?? {})
  // Remounts the fields when a lookup fills them in.
  const [version, setVersion] = useState(0)
  const [method, setMethod] = useState<InvoiceMethod>(
    broker?.invoice_method ?? "email"
  )
  const [factored, setFactored] = useState(broker?.factored ?? false)
  const [noa, setNoa] = useState(broker?.noa_on_file ?? false)

  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    brokerSchema,
    async (values) => {
      if (broker) {
        const result = await updateBroker(organizationId, broker.id, values)
        if ("error" in result) {
          return result.error
        }
        toast.success(`${values.legal_name} saved.`)
        return
      }
      const result = await createBroker(organizationId, values)
      if ("error" in result) {
        return result.error
      }
      if (result.fmcsaError) {
        toast.warning(
          `${values.legal_name} added, but the FMCSA check didn't run: ${result.fmcsaError}`
        )
      } else {
        toast.success(`${values.legal_name} added.`)
      }
      router.push(`${base}/${result.id}`)
    }
  )

  const methodRef = useHiddenValue(method, revalidate)
  const factoredRef = useHiddenValue(factored, revalidate)
  const noaRef = useHiddenValue(noa, revalidate)

  return (
    <div className="flex flex-col gap-6">
      {!broker && (
        <McLookupCard
          organizationId={organizationId}
          base={base}
          onFound={(record, mc) => {
            setDefaults({
              mc_number: mc,
              ...(record && {
                legal_name: record.legal_name ?? undefined,
                dba_name: record.dba_name,
                dot_number: record.dot_number,
                address_line1: record.street,
                city: record.city,
                state: record.state,
                postal_code: record.postal_code?.slice(0, 5) ?? null,
              }),
            })
            setVersion((v) => v + 1)
          }}
        />
      )}
      <form {...formProps} autoComplete="off" key={version}>
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
        <fieldset disabled={pending} className="flex flex-col gap-6">
          <SettingsCard
            title="Broker"
            description="As registered with FMCSA."
            contentClassName="grid gap-5 sm:grid-cols-6"
          >
            <TextField
              name="legal_name"
              label="Legal name"
              placeholder="e.g. Total Quality Logistics, LLC"
              defaultValue={defaults.legal_name ?? undefined}
              errors={errors}
              className="sm:col-span-3"
            />
            <TextField
              name="dba_name"
              label="DBA name"
              placeholder="e.g. TQL"
              defaultValue={defaults.dba_name ?? undefined}
              errors={errors}
              className="sm:col-span-3"
            />
            <TextField
              name="mc_number"
              label="MC number"
              inputMode="numeric"
              placeholder="e.g. 411443"
              defaultValue={defaults.mc_number ?? undefined}
              errors={errors}
              className="sm:col-span-3"
              onChange={digitsOnly(8)}
              hint="Used to check them with FMCSA."
            />
            <TextField
              name="dot_number"
              label="USDOT number"
              inputMode="numeric"
              placeholder="e.g. 2223101"
              defaultValue={defaults.dot_number ?? undefined}
              errors={errors}
              className="sm:col-span-3"
              onChange={digitsOnly(8)}
            />
            <TextField
              name="email_domains"
              label="Email domains"
              placeholder="e.g. tql.com"
              defaultValue={broker?.email_domains.join(", ")}
              errors={errors}
              className="sm:col-span-6"
              onChange={handleLowercase}
              hint="Domains their people email from, separated by commas. Rate cons from any other domain get a warning."
            />
          </SettingsCard>

          <SettingsCard
            title="Mailing address"
            description={
              !broker && defaults.address_line1
                ? "Filled in from FMCSA's physical address. Change it if their mail goes elsewhere."
                : "Where paper invoices and checks go."
            }
            contentClassName="grid gap-5 sm:grid-cols-6"
          >
            <TextField
              name="address_line1"
              label="Street address"
              defaultValue={defaults.address_line1 ?? undefined}
              errors={errors}
              className="sm:col-span-6"
            />
            <TextField
              name="address_line2"
              label="Suite, unit or PO box"
              defaultValue={defaults.address_line2 ?? undefined}
              errors={errors}
              className="sm:col-span-6"
            />
            <TextField
              name="city"
              label="City"
              defaultValue={defaults.city ?? undefined}
              errors={errors}
              className="sm:col-span-3"
            />
            <TextField
              name="state"
              label="State"
              placeholder="TX"
              defaultValue={defaults.state ?? undefined}
              errors={errors}
              className="sm:col-span-1"
              onChange={handleStateInput}
            />
            <TextField
              name="postal_code"
              label="ZIP code"
              inputMode="numeric"
              defaultValue={defaults.postal_code ?? undefined}
              errors={errors}
              className="sm:col-span-2"
            />
          </SettingsCard>

          <SettingsCard
            title="Billing"
            description="Where invoice packets go, and how fast they pay."
            contentClassName="grid gap-5 sm:grid-cols-6"
          >
            <Field
              data-invalid={!!errors.invoice_method}
              className="sm:col-span-6"
            >
              <FieldLabel id="broker-invoice-method-label">
                How they take invoices
              </FieldLabel>
              <ToggleGroup
                aria-labelledby="broker-invoice-method-label"
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
              <FieldDescription>
                {method === "portal"
                  ? "You'll upload packets to their site yourself. The app marks them for manual upload and never says it sent them."
                  : "Packets are emailed to the billing addresses below."}
              </FieldDescription>
            </Field>
            {method === "portal" && (
              <TextField
                name="portal_url"
                label="Portal address"
                placeholder="https://"
                defaultValue={broker?.portal_url ?? undefined}
                errors={errors}
                className="sm:col-span-6"
              />
            )}
            <Field
              data-invalid={!!errors.billing_emails}
              className="sm:col-span-6"
            >
              <FieldLabel htmlFor="broker-billing-emails">
                Billing emails
                {method === "portal" && (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    (optional)
                  </span>
                )}
              </FieldLabel>
              <Textarea
                id="broker-billing-emails"
                name="billing_emails"
                rows={2}
                placeholder="carrierinvoices@tql.com"
                defaultValue={broker?.billing_emails.join("\n")}
                aria-invalid={!!errors.billing_emails}
                onChange={handleLowercase}
              />
              {errors.billing_emails ? (
                <FieldError errors={errors.billing_emails} />
              ) : (
                <FieldDescription>
                  One per line, or separated by commas.
                </FieldDescription>
              )}
            </Field>
            <TextField
              name="payment_terms_days"
              label="Payment terms"
              inputMode="numeric"
              suffix="days"
              defaultValue={broker?.payment_terms_days ?? 30}
              errors={errors}
              className="sm:col-span-3"
              onChange={digitsOnly(3)}
              hint="Net 30 unless they say otherwise. 0 means due on receipt."
            />
            <TextField
              name="quick_pay_fee_percent"
              label="Quick-pay fee"
              inputMode="decimal"
              suffix="%"
              placeholder="e.g. 2.5"
              defaultValue={broker?.quick_pay_fee_percent ?? undefined}
              errors={errors}
              className="sm:col-span-3"
              hint="Taken off the rate for paying early."
            />
          </SettingsCard>

          <SettingsCard
            title="Factoring"
            description="If you factor this broker's loads, packets go to your factoring company instead."
          >
            <div className="flex flex-col gap-3">
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
                  The notice of assignment (NOA) is on file with the broker
                </Label>
              )}
            </div>
          </SettingsCard>

          <SettingsCard
            title="Notes"
            footer={
              <SettingsCardFooter
                hint={
                  formError ? (
                    <span className="text-destructive">{formError}</span>
                  ) : broker ? (
                    "Changes are saved for everyone in your organization."
                  ) : (
                    "Brokers with an MC number are checked with FMCSA when saved."
                  )
                }
              >
                {!broker && (
                  <Link
                    href={base}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Cancel
                  </Link>
                )}
                <Button type="submit" size="sm" disabled={pending}>
                  {pending
                    ? "Saving…"
                    : broker
                      ? "Save changes"
                      : "Save broker"}{" "}
                  <CornerDownLeft />
                </Button>
              </SettingsCardFooter>
            }
          >
            <Field data-invalid={!!errors.notes}>
              <FieldLabel htmlFor="broker-notes" className="sr-only">
                Notes
              </FieldLabel>
              <Textarea
                id="broker-notes"
                name="notes"
                rows={3}
                placeholder="Who to call, detention policy, past problems…"
                defaultValue={broker?.notes ?? undefined}
                aria-invalid={!!errors.notes}
              />
              <FieldError errors={errors.notes} />
            </Field>
          </SettingsCard>
        </fieldset>
      </form>
    </div>
  )
}
