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
} from "@/app/org/[slug]/customers/actions"
import { AddRecordPanel } from "@/components/add-record-panel"
import { FlagBadge } from "@/components/brokers/broker-badges"
import { FmcsaDown } from "@/components/brokers/fmcsa-down"
import { ContactsDraft } from "@/components/brokers/contacts-draft"
import { LeaveGuard } from "@/components/leave-guard"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
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
import { formatPhone, handlePhoneInput, handlePhoneKeyDown } from "@/lib/phone"
import {
  describeSubmission,
  type FactoringCompany,
} from "@/lib/factoring-format"
import type { FmcsaRecord } from "@/lib/fmcsa"
import {
  brokerSchema,
  CUSTOMER_KIND_LABELS,
  CUSTOMER_KINDS,
  INVOICE_METHODS,
  INVOICE_METHOD_LABELS,
  type BrokerInput,
  type ContactValues,
  type CustomerKind,
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
    | "phone"
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
  const cleanedMc = mc.replace(/\D/g, "")

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
            ) : result.fmcsaUnavailable ? (
              <FmcsaDown
                mc={cleanedMc}
                savedOn={
                  result.fmcsa
                    ? new Date(result.fmcsa.checked_at).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric", year: "numeric" }
                      )
                    : null
                }
              />
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

/** The cards on the customer page's Overview, each saved on its own. */
export type BrokerFormCard = "company" | "address" | "billing" | "factoring"

/** The form's cards, for the Add customer panel's links. */
const CARD_IDS = {
  type: "customer-type-card",
  company: "customer-company-card",
  contacts: "customer-contacts-card",
  address: "customer-address-card",
  billing: "customer-billing-card",
  factoring: "customer-factoring-card",
  doNotUse: "customer-do-not-use-card",
  notes: "customer-notes-card",
}

/** Every named field's value, to tell which cards have unsaved changes. */
function snapshot(form: HTMLFormElement | null) {
  const values = new Map<string, string>()
  if (form) {
    const data = new FormData(form)
    for (const name of new Set(data.keys())) {
      values.set(name, data.getAll(name).map(String).join("\u0000"))
    }
  }
  return values
}

/** The card an element (or the field with this name) sits in. */
function cardOf(from: Element | HTMLFormElement, name?: string) {
  let element: Element | null = from
  if (name !== undefined) {
    const item = (from as HTMLFormElement).elements.namedItem(name)
    element = item instanceof RadioNodeList ? (item[0] as Element) : item
  }
  return element?.closest<HTMLElement>("[data-card]")?.dataset.card as
    BrokerFormCard | undefined
}

function KindToggle({
  kind,
  onChange,
}: {
  kind: CustomerKind
  onChange: (kind: CustomerKind) => void
}) {
  return (
    <ToggleGroup
      aria-label="Customer type"
      variant="outline"
      size="sm"
      spacing={1}
      value={[kind]}
      onValueChange={(value: string[]) => {
        if (value[0]) onChange(value[0] as CustomerKind)
      }}
    >
      {CUSTOMER_KINDS.map((key) => (
        <ToggleGroupItem key={key} value={key}>
          {CUSTOMER_KIND_LABELS[key]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/**
 * The fields for a customer. With `broker` it edits that customer on their
 * page, each card saving on its own like the truck and driver pages; without,
 * it adds one, starting with an MC lookup, with what's filled in and saving
 * beside the cards, and opens their page.
 */
export function BrokerForm({
  organizationId,
  base,
  broker,
  factoring,
  factoringHref,
}: {
  organizationId: string
  /** /org/<slug>/customers */
  base: string
  broker?: Broker
  /** Your factoring company, if it's set up. */
  factoring: FactoringCompany | null
  /** /org/<slug>/settings/factoring */
  factoringHref: string
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [defaults, setDefaults] = useState<Defaults>(broker ?? {})
  const [kind, setKind] = useState<CustomerKind>(broker?.kind ?? "broker")
  const isBroker = kind === "broker"
  // Remounts the fields when a lookup fills them in.
  const [version, setVersion] = useState(0)
  const [method, setMethod] = useState<InvoiceMethod>(
    broker?.invoice_method ?? "email"
  )
  const [factored, setFactored] = useState(broker?.factored ?? false)
  const [noa, setNoa] = useState(broker?.noa_on_file ?? false)
  const [contacts, setContacts] = useState<ContactValues[]>([])
  // Only on Add customer; the customer page has its own control for this.
  const [doNotUse, setDoNotUse] = useState(false)
  const [doNotUseReason, setDoNotUseReason] = useState("")

  // Editing: the values as loaded (or last saved), which cards differ from
  // them, and which card's Save was pressed. Adding: whether anything's
  // been entered, to warn before leaving.
  const baseline = useRef<Map<string, string> | null>(null)
  const [dirtyCards, setDirtyCards] = useState<Set<BrokerFormCard>>(
    () => new Set()
  )
  const [savingCard, setSavingCard] = useState<BrokerFormCard | null>(null)
  const [entered, setEntered] = useState(false)

  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    brokerSchema,
    async (values) => {
      if (broker) {
        // Notes save from their own box beside the page: leave them be.
        const result = await updateBroker(organizationId, broker.id, {
          ...values,
          notes: undefined,
        })
        if ("error" in result) {
          return result.error
        }
        baseline.current = snapshot(formRef.current)
        setDirtyCards(new Set())
        toast.success(`${values.legal_name} saved.`)
        return
      }
      const result = await createBroker(organizationId, values, contacts, {
        do_not_use: doNotUse,
        do_not_use_reason: doNotUse ? doNotUseReason : null,
      })
      if ("error" in result) {
        return result.error
      }
      if (result.contactsError) {
        toast.warning(
          `${values.legal_name} added, but the contacts didn't save: ${result.contactsError} Add them on their page.`
        )
      } else if (result.fmcsaError) {
        toast.warning(
          `${values.legal_name} added, but the FMCSA check didn't run: ${result.fmcsaError}`
        )
      } else {
        toast.success(`${values.legal_name} added.`)
      }
      setEntered(false)
      router.push(`${base}/${result.id}`)
    }
  )

  /** Which cards have a field that differs from the baseline. */
  function checkDirty(form: HTMLFormElement | null) {
    if (!form) return
    baseline.current ??= snapshot(form)
    const start = baseline.current
    const now = snapshot(form)
    const names = new Set([...start.keys(), ...now.keys()])
    if (!broker) {
      setEntered(
        [...names].some((name) => start.get(name) !== now.get(name)) ||
          contacts.length > 0
      )
      return
    }
    const dirty = new Set<BrokerFormCard>()
    for (const name of names) {
      if (start.get(name) !== now.get(name)) {
        const card = cardOf(form, name)
        if (card) dirty.add(card)
      }
    }
    setDirtyCards(dirty)
  }

  /** For fields a custom control fills in, which fire no change events. */
  function onUpdate(form: HTMLFormElement | null) {
    revalidate(form)
    checkDirty(form)
  }

  const kindRef = useHiddenValue(kind, onUpdate)
  const methodRef = useHiddenValue(method, onUpdate)
  const factoredRef = useHiddenValue(factored, onUpdate)
  const noaRef = useHiddenValue(noa, onUpdate)

  // Enter in a field saves the card it's in (when editing), rather than
  // pressing the form's first Save button.
  function onKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    const target = event.target
    if (
      !broker ||
      event.key !== "Enter" ||
      !(target instanceof HTMLInputElement) ||
      ["button", "submit", "checkbox", "radio"].includes(target.type)
    ) {
      return
    }
    event.preventDefault()
    const card = cardOf(target)
    const button =
      card &&
      event.currentTarget.querySelector<HTMLButtonElement>(
        `[data-card="${card}"] button[type="submit"]`
      )
    if (button && !button.disabled) {
      setSavingCard(card)
      event.currentTarget.requestSubmit(button)
    }
  }

  const cardFooter = (card: BrokerFormCard) =>
    broker ? (
      <SettingsCardFooter
        hint={
          savingCard === card &&
          formError && <span className="text-destructive">{formError}</span>
        }
      >
        <Button
          type="submit"
          size="sm"
          disabled={pending || !dirtyCards.has(card)}
          onClick={() => setSavingCard(card)}
        >
          {pending && savingCard === card ? "Saving…" : "Save"}{" "}
          <CornerDownLeft />
        </Button>
      </SettingsCardFooter>
    ) : undefined

  return (
    <>
      {!broker && <LeaveGuard when={entered && !pending} />}
      <form
        {...formProps}
        ref={(form) => {
          formRef.current = form
          if (form && !baseline.current) baseline.current = snapshot(form)
        }}
        autoComplete="off"
        onChange={(event) => {
          formProps.onChange(event)
          checkDirty(event.currentTarget)
        }}
        onKeyDown={onKeyDown}
      >
        <fieldset
          disabled={pending}
          className={
            broker
              ? "flex flex-col gap-4"
              : // Adding: the cards, with what's filled in and saving beside
                // them, as on Add truck and New load.
                "grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1fr)_20rem] @6xl/main:grid-cols-[minmax(0,1fr)_24rem]"
          }
        >
          <div
            className={
              broker
                ? "contents"
                : "flex min-w-0 flex-col gap-6 @4xl/main:col-start-1 @4xl/main:row-start-1"
            }
          >
            {!broker && (
              <SettingsCard
                id={CARD_IDS.type}
                className="scroll-mt-6"
                title="Customer type"
                description="A broker arranges the load for a fee. A direct shipper owns the freight and pays you themselves."
              >
                <input ref={kindRef} type="hidden" name="kind" value={kind} />
                <KindToggle kind={kind} onChange={setKind} />
              </SettingsCard>
            )}
            {!broker && isBroker && (
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
                      phone: record.phone,
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

            {/* Remounted when a lookup fills the fields in. */}
            <div key={version} className="contents">
              <SettingsCard
                id={CARD_IDS.company}
                className="scroll-mt-6"
                data-card="company"
                title={broker ? "Company" : CUSTOMER_KIND_LABELS[kind]}
                description={
                  isBroker
                    ? "As registered with FMCSA."
                    : "The company you bill for the load."
                }
                footer={cardFooter("company")}
                contentClassName="grid gap-5 sm:grid-cols-6"
              >
                {broker && (
                  <input ref={kindRef} type="hidden" name="kind" value={kind} />
                )}
                {broker && (
                  <Field className="sm:col-span-6">
                    <FieldLabel id="broker-kind-label">Type</FieldLabel>
                    <KindToggle kind={kind} onChange={setKind} />
                  </Field>
                )}
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
                {isBroker && (
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
                )}
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
                  name="phone"
                  label="Main phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  defaultValue={
                    defaults.phone ? formatPhone(defaults.phone) : undefined
                  }
                  errors={errors}
                  onChange={handlePhoneInput}
                  onKeyDown={handlePhoneKeyDown}
                  hint="The number you'd call to check a rate con is real."
                  // Brokers have an MC number beside USDOT; shippers don't.
                  className={isBroker ? "sm:col-span-2" : "sm:col-span-3"}
                />
                <TextField
                  name="email_domains"
                  label="Email domains"
                  placeholder="e.g. tql.com"
                  defaultValue={broker?.email_domains.join(", ")}
                  errors={errors}
                  onChange={handleLowercase}
                  hint="Domains their people email from, separated by commas. Rate cons from any other domain get a warning."
                  className={isBroker ? "sm:col-span-4" : "sm:col-span-6"}
                />
              </SettingsCard>

              {!broker && (
                <div id={CARD_IDS.contacts} className="scroll-mt-6">
                  <ContactsDraft
                    contacts={contacts}
                    onChange={(next) => {
                      setContacts(next)
                      if (next.length) setEntered(true)
                    }}
                    disabled={pending}
                  />
                </div>
              )}

              <SettingsCard
                id={CARD_IDS.address}
                className="scroll-mt-6"
                data-card="address"
                title="Mailing address"
                description={
                  !broker && defaults.address_line1
                    ? "Filled in from FMCSA's physical address. Change it if their mail goes elsewhere."
                    : "Where paper invoices and checks go."
                }
                footer={cardFooter("address")}
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
            </div>

            <SettingsCard
              id={CARD_IDS.billing}
              className="scroll-mt-6"
              data-card="billing"
              title="Billing"
              description="Where invoice packets go, and how fast they pay."
              footer={cardFooter("billing")}
              contentClassName="grid gap-5 sm:grid-cols-6"
            >
              <input
                ref={methodRef}
                type="hidden"
                name="invoice_method"
                value={method}
              />
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
              id={CARD_IDS.factoring}
              className="scroll-mt-6"
              data-card="factoring"
              title="Factoring"
              description="If you factor this customer's loads, packets go to your factoring company instead."
              footer={cardFooter("factoring")}
            >
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
              <div className="flex flex-col gap-3">
                <Label className="flex items-center gap-3 font-normal">
                  <Checkbox
                    checked={factored}
                    onCheckedChange={(checked) => setFactored(checked === true)}
                  />
                  We factor this customer&apos;s loads
                </Label>
                {factored && (
                  <Label className="flex items-center gap-3 font-normal">
                    <Checkbox
                      checked={noa}
                      onCheckedChange={(checked) => setNoa(checked === true)}
                    />
                    The notice of assignment (NOA) is on file with them
                  </Label>
                )}
                {factored && (
                  <p className="text-sm text-muted-foreground">
                    {factoring ? (
                      <>
                        Packets go to{" "}
                        <span className="font-medium text-foreground">
                          {factoring.name}
                        </span>
                        , {describeSubmission(factoring)}.{" "}
                        <Link href={factoringHref} className="underline">
                          Change
                        </Link>
                      </>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-300">
                        Your factoring company isn&apos;t set up yet, so the app
                        doesn&apos;t know where packets go.{" "}
                        <Link href={factoringHref} className="underline">
                          Set it up
                        </Link>
                      </span>
                    )}
                  </p>
                )}
              </div>
            </SettingsCard>

            {!broker && (
              <SettingsCard
                id={CARD_IDS.doNotUse}
                className="scroll-mt-6"
                title="Do not use"
                description="For a customer you're adding only to keep on record, e.g. one who never paid."
              >
                <div className="flex flex-col gap-3">
                  <Label className="flex items-center gap-3 font-normal">
                    <Checkbox
                      checked={doNotUse}
                      onCheckedChange={(checked) =>
                        setDoNotUse(checked === true)
                      }
                    />
                    Don&apos;t book loads with them
                  </Label>
                  {doNotUse && (
                    <Textarea
                      aria-label="Why not to use this customer"
                      rows={2}
                      maxLength={500}
                      placeholder="Why? e.g. paid 90 days late twice"
                      value={doNotUseReason}
                      onChange={(event) =>
                        setDoNotUseReason(event.target.value)
                      }
                    />
                  )}
                </div>
              </SettingsCard>
            )}

            {/* On the customer page, notes save from their own box. */}
            {!broker && (
              <SettingsCard
                id={CARD_IDS.notes}
                className="scroll-mt-6"
                title="Notes"
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
                    aria-invalid={!!errors.notes}
                  />
                  <FieldError errors={errors.notes} />
                </Field>
              </SettingsCard>
            )}
          </div>

          {!broker && (
            // Beside the cards, what's filled in and saving stay in view; on
            // a phone they come after them.
            <aside className="@4xl/main:sticky @4xl/main:top-6 @4xl/main:col-start-2 @4xl/main:row-start-1">
              <AddRecordPanel
                eyebrow="New customer"
                placeholderTitle="Add a customer"
                nameField="legal_name"
                sections={[
                  { id: CARD_IDS.type, label: "Customer type" },
                  {
                    id: CARD_IDS.company,
                    label: CUSTOMER_KIND_LABELS[kind],
                  },
                  { id: CARD_IDS.contacts, label: "Contacts", optional: true },
                  { id: CARD_IDS.address, label: "Mailing address" },
                  { id: CARD_IDS.billing, label: "Billing" },
                  {
                    id: CARD_IDS.doNotUse,
                    label: "Do not use",
                    optional: true,
                  },
                  { id: CARD_IDS.notes, label: "Notes", optional: true },
                ]}
                hint={
                  isBroker
                    ? "Saving needs the legal name, and a billing email unless they take invoices through a portal. Brokers with an MC number are checked with FMCSA when saved."
                    : "Saving needs the legal name, and a billing email unless they take invoices through a portal. Anything else can be added from their page later."
                }
                submitLabel="Save customer"
                pending={pending}
                cancelHref={base}
                formError={formError}
              />
            </aside>
          )}
        </fieldset>
      </form>
    </>
  )
}
