"use client"

import { cn } from "cn"

import { CornerDownLeft, FileText, Upload } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { createDriver, updateDriver } from "@/app/org/[slug]/drivers/actions"
import { DateField } from "@/components/drivers/date-field"
import { PayFields } from "@/components/drivers/pay-fields"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useZodForm } from "@/hooks/use-zod-form"
import { DRIVER_CDL_ID } from "@/lib/driver-format"
import { FILE_TYPES, uploadDriverDocument } from "@/lib/driver-document-upload"
import type { Driver } from "@/lib/drivers"
import { formatPhone, handlePhoneInput, handlePhoneKeyDown } from "@/lib/phone"
import {
  CDL_CLASSES,
  CDL_CLASS_LABELS,
  CDL_ENDORSEMENTS,
  CDL_ENDORSEMENT_LABELS,
  driverSchema,
  type CdlEndorsement,
  type DriverInput,
} from "@/lib/schemas/driver"

type Name = keyof DriverInput
export type DriverFormCard = "details" | "cdl" | "pay" | "notes"
type Errors = Partial<Record<Name, { message: string }[]>>

const fieldId = (name: Name) => `driver-${name.replaceAll("_", "-")}`

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
  hint?: string
  className?: string
} & Omit<React.ComponentProps<"input">, "name" | "className">) {
  const id = fieldId(name)
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

/** Each field's value, to compare against what was loaded. */
function snapshot(form: HTMLFormElement | null) {
  const values = new Map<string, string>()
  if (form) {
    const data = new FormData(form)
    for (const name of new Set(data.keys())) {
      values.set(
        name,
        data
          .getAll(name)
          .map((value) => (typeof value === "string" ? value : value.name))
          .join("\u0000")
      )
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
    DriverFormCard | undefined
}

function saveButton(form: HTMLFormElement, card: DriverFormCard) {
  return form.querySelector<HTMLButtonElement>(
    `[data-card="${card}"] button[type="submit"]`
  )
}

/** Uppercases as you type, keeping the caret where it was. */
/**
 * The endorsements as checkboxes, kept in one hidden field ("H,N") so the
 * form sends them as a single value. `onUpdate` runs after a change, since
 * a field filled from state fires no change event of its own.
 */
function EndorsementsField({
  defaultValue,
  errors,
  onUpdate,
}: {
  defaultValue: CdlEndorsement[]
  errors?: { message: string }[]
  onUpdate: (form: HTMLFormElement | null) => void
}) {
  const [chosen, setChosen] = useState<CdlEndorsement[]>(defaultValue)
  const hiddenRef = useRef<HTMLInputElement>(null)
  const firstRender = useRef(true)
  const value = CDL_ENDORSEMENTS.filter((e) => chosen.includes(e)).join(",")

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onUpdate(hiddenRef.current?.form ?? null)
    // Only when the value changes; onUpdate is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <fieldset className="grid gap-2 sm:col-span-6">
      <legend className="mb-1 text-sm font-medium">Endorsements</legend>
      <input
        ref={hiddenRef}
        type="hidden"
        name="cdl_endorsements"
        value={value}
      />
      <div className="flex flex-wrap gap-2">
        {CDL_ENDORSEMENTS.map((code) => (
          <label
            key={code}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm has-checked:border-brand has-checked:bg-brand/10 has-checked:text-brand-ink"
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={chosen.includes(code)}
              onChange={(event) =>
                setChosen((current) =>
                  event.target.checked
                    ? [...current, code]
                    : current.filter((e) => e !== code)
                )
              }
            />
            <span className="font-semibold">{code}</span>
            <span className="text-muted-foreground">
              {CDL_ENDORSEMENT_LABELS[code]}
            </span>
          </label>
        ))}
      </div>
      {errors?.length ? <FieldError errors={errors} /> : null}
    </fieldset>
  )
}

/**
 * A photo or PDF of the CDL, saved straight away with the driver's
 * documents (the same copy the Documents card shows). Its file input has
 * no name, so the form's own save leaves it out.
 */
function CdlCopyField({
  organizationId,
  driverId,
  copy,
}: {
  organizationId: string
  driverId: string
  copy: { file_name: string; url: string | null } | null
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [sending, setSending] = useState<string | null>(null)

  async function upload(file: File) {
    setSending(file.name)
    const problem = await uploadDriverDocument(organizationId, driverId, {
      kind: "cdl",
      title: "",
      expires_on: "",
      file,
    })
    setSending(null)
    if (problem) {
      toast.error(problem)
      return
    }
    toast.success("CDL copy saved.")
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:col-span-6">
      <span className="text-sm font-medium">Copy of the CDL</span>
      <div className="flex min-w-0 items-center gap-2">
        {copy && !sending ? (
          <span className="inline-flex max-w-full items-center rounded-md border">
            <a
              href={copy.url ?? undefined}
              target="_blank"
              rel="noreferrer"
              title={`Open ${copy.file_name}`}
              className="inline-flex h-8 min-w-0 items-center gap-1.5 px-2.5 text-sm font-medium text-brand hover:underline"
            >
              <FileText className="size-4 shrink-0" />
              <span className="truncate">{copy.file_name}</span>
            </a>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Replace the CDL copy"
              title="Replace the CDL copy"
              className="rounded-l-none border-l"
              onClick={() => fileInput.current?.click()}
            >
              <Upload />
            </Button>
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!!sending}
            className="max-w-full"
            onClick={() => fileInput.current?.click()}
          >
            <Upload />
            <span className="truncate">{sending ?? "Upload"}</span>
          </Button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept={FILE_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) void upload(file)
          }}
        />
      </div>
    </div>
  )
}

function handleUppercaseInput(event: React.ChangeEvent<HTMLInputElement>) {
  const input = event.currentTarget
  const upper = input.value.toUpperCase()
  if (upper !== input.value) {
    const { selectionStart, selectionEnd } = input
    input.value = upper
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
  if (cleaned !== input.value) {
    input.value = cleaned
  }
}

/**
 * The fields for a driver. With `driver` it edits that driver and stays on the
 * page; without, it adds a new one and goes back to the list.
 */
export function DriverForm({
  organizationId,
  base,
  driver,
  cardClassName,
  cdlCopy,
}: {
  organizationId: string
  /** /org/<slug>/drivers */
  base: string
  driver?: Driver
  /** The newest copy of the CDL on file, shown on the CDL card. */
  cdlCopy?: { file_name: string; url: string | null } | null
  /**
   * Classes for each card (pay is only a card when adding a driver). When given, the form adds no box of its own, so
   * its cards sit directly in the page's column and can be ordered among
   * the other cards there.
   */
  cardClassName?: Partial<Record<DriverFormCard, string>>
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  // The values as loaded (or last saved), to tell which cards have changes.
  const baseline = useRef<Map<string, string> | null>(null)
  const [dirtyCards, setDirtyCards] = useState<Set<DriverFormCard>>(new Set())
  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    driverSchema,
    async (values) => {
      if (driver) {
        const result = await updateDriver(organizationId, driver.id, values)
        if ("error" in result) {
          return result.error
        }
        toast.success(`${values.full_name} saved.`)
        // What's saved is the new starting point, so the buttons go quiet.
        baseline.current = snapshot(formRef.current)
        setDirtyCards(new Set())
        return
      }

      const result = await createDriver(organizationId, values)
      if ("error" in result) {
        return result.error
      }

      // Documents are uploaded on the driver's page, so go there next.
      toast.success(`${values.full_name} added. Upload their documents here.`)
      router.push(`${base}/${result.id}#documents`)
    }
  )

  useEffect(() => {
    baseline.current = snapshot(formRef.current)
  }, [])

  /** Which cards have a field that differs from the baseline. */
  function checkDirty(form: HTMLFormElement | null) {
    if (!form || !baseline.current || !driver) {
      return
    }
    const now = snapshot(form)
    const dirty = new Set<DriverFormCard>()
    for (const name of new Set([...baseline.current.keys(), ...now.keys()])) {
      if (baseline.current.get(name) !== now.get(name)) {
        const card = cardOf(form, name)
        if (card) {
          dirty.add(card)
        }
      }
    }
    setDirtyCards(dirty)
  }

  /** For fields a custom control fills in, which fire no change events. */
  function onUpdate(form: HTMLFormElement | null) {
    revalidate(form)
    checkDirty(form)
  }

  // When editing, every card gets its own save bar so you don't have to
  // scroll to the bottom. They all submit the same form, so remember which
  // card the save came from and show "Saving…" and errors only there.
  const [savingCard, setSavingCard] = useState<DriverFormCard>("notes")

  function markSavingCard(event: React.MouseEvent<HTMLButtonElement>) {
    setSavingCard(cardOf(event.currentTarget) ?? "notes")
  }

  // Enter in a field would press the form's first save button, which is
  // disabled unless the first card changed. Save from the field's own card.
  function onKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    const target = event.target
    if (
      !driver ||
      event.key !== "Enter" ||
      !(target instanceof HTMLInputElement) ||
      ["button", "submit", "checkbox", "radio"].includes(target.type)
    ) {
      return
    }
    event.preventDefault()
    const card = cardOf(target)
    const button = card && saveButton(event.currentTarget, card)
    if (button && !button.disabled) {
      setSavingCard(card)
      event.currentTarget.requestSubmit(button)
    }
  }

  const saveLabel = (card: DriverFormCard) =>
    pending && savingCard === card ? "Saving…" : "Save"

  const cardFooter = (card: DriverFormCard) =>
    driver ? (
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
          onClick={markSavingCard}
        >
          {saveLabel(card)} <CornerDownLeft />
        </Button>
      </SettingsCardFooter>
    ) : undefined

  return (
    <form
      {...formProps}
      ref={formRef}
      autoComplete="off"
      className={cardClassName && "contents"}
      onChange={(event) => {
        formProps.onChange(event)
        checkDirty(event.currentTarget)
      }}
      onKeyDown={onKeyDown}
    >
      <fieldset
        disabled={pending}
        className={cardClassName ? "contents" : "flex flex-col gap-6"}
      >
        <SettingsCard
          title={driver ? "Driver details" : "Driver"}
          description="Name, how to reach them, and when they started."
          data-card="details"
          className={cardClassName?.details}
          footer={cardFooter("details")}
          contentClassName="grid gap-5 sm:grid-cols-6"
        >
          <TextField
            name="full_name"
            label="Full name"
            placeholder="e.g. Marcus Hill"
            defaultValue={driver?.full_name}
            errors={errors}
            className="sm:col-span-6"
            autoFocus={!driver}
          />
          <TextField
            name="phone"
            label="Sign-in number"
            type="tel"
            placeholder="(555) 123-4567"
            defaultValue={driver?.phone ? formatPhone(driver.phone) : undefined}
            errors={errors}
            className="sm:col-span-3"
            onChange={handlePhoneInput}
            onKeyDown={handlePhoneKeyDown}
          />
          <TextField
            name="email"
            label="Email"
            type="email"
            placeholder="marcus@example.com"
            defaultValue={driver?.email ?? undefined}
            errors={errors}
            className="sm:col-span-3"
          />
          <DateField
            id={fieldId("start_date")}
            name="start_date"
            label="Start date"
            defaultValue={driver?.start_date}
            errors={errors.start_date}
            onUpdate={onUpdate}
            className="sm:col-span-3"
          />
          <label className="flex items-start gap-2 text-sm sm:col-span-3 sm:pt-8">
            <input
              type="checkbox"
              name="holds_medical_variance"
              defaultChecked={driver?.holds_medical_variance ?? false}
              className="mt-0.5 size-4 accent-brand"
            />
            <span>
              Holds a medical variance, SPE certificate or exemption letter
            </span>
          </label>
        </SettingsCard>

        <SettingsCard
          // The side panel's CDL links jump here.
          id={DRIVER_CDL_ID}
          className={cn("scroll-mt-6", cardClassName?.cdl)}
          title="CDL"
          description="The license as printed. You'll see a warning 60, 30 and 7 days before it expires."
          data-card="cdl"
          footer={cardFooter("cdl")}
          contentClassName="grid gap-5 sm:grid-cols-6"
        >
          <TextField
            name="cdl_number"
            label="CDL number"
            placeholder="e.g. 12345678"
            defaultValue={driver?.cdl_number ?? undefined}
            errors={errors}
            className="sm:col-span-4"
            onChange={handleUppercaseInput}
          />
          <TextField
            name="cdl_state"
            label="Issuing state"
            placeholder="TX"
            autoCapitalize="characters"
            defaultValue={driver?.cdl_state ?? undefined}
            errors={errors}
            className="sm:col-span-2"
            onChange={handleStateInput}
          />
          <fieldset className="grid gap-2 sm:col-span-6">
            <legend className="mb-1 text-sm font-medium">Class</legend>
            <div className="flex flex-wrap gap-2">
              {CDL_CLASSES.map((value) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm has-checked:border-brand has-checked:bg-brand/10 has-checked:text-brand-ink"
                >
                  <input
                    type="radio"
                    name="cdl_class"
                    value={value}
                    defaultChecked={driver?.cdl_class === value}
                    className="sr-only"
                  />
                  {CDL_CLASS_LABELS[value]}
                </label>
              ))}
            </div>
            {errors.cdl_class && <FieldError errors={errors.cdl_class} />}
          </fieldset>
          <EndorsementsField
            defaultValue={driver?.cdl_endorsements ?? []}
            errors={errors.cdl_endorsements}
            onUpdate={onUpdate}
          />
          <TextField
            name="cdl_restrictions"
            label="Restrictions"
            placeholder="e.g. L, Z"
            hint="The letters printed on the license, if any."
            defaultValue={driver?.cdl_restrictions ?? undefined}
            errors={errors}
            className="sm:col-span-3"
            onChange={handleUppercaseInput}
          />
          <DateField
            id={fieldId("cdl_expires_on")}
            name="cdl_expires_on"
            label="CDL expires"
            hint="The expiration date printed on the license."
            defaultValue={driver?.cdl_expires_on}
            errors={errors.cdl_expires_on}
            onUpdate={onUpdate}
            className="sm:col-span-3"
          />
          <TextField
            name="prior_license_states"
            label="Other states, past 3 years"
            placeholder="e.g. OK, NM"
            hint="Every other state that licensed them in the past 3 years. A hiring driving record is needed from each."
            autoCapitalize="characters"
            defaultValue={driver?.prior_license_states.join(", ") ?? undefined}
            errors={errors}
            className="sm:col-span-6"
            onChange={handleUppercaseInput}
          />
          {driver && (
            <CdlCopyField
              organizationId={organizationId}
              driverId={driver.id}
              copy={cdlCopy ?? null}
            />
          )}
        </SettingsCard>

        {driver ? (
          // Pay is changed in the Pay card on the driver page. These keep
          // the current rate in the form, so saving here never clears it,
          // and follow it when that card saves a new one.
          <>
            <input
              type="hidden"
              name="pay_type"
              value={driver.pay_type ?? ""}
            />
            <input
              type="hidden"
              name="pay_rate"
              value={driver.pay_rate === null ? "" : String(driver.pay_rate)}
            />
          </>
        ) : (
          <SettingsCard
            title="Pay"
            description="Used to work out profit per load."
            className={cardClassName?.pay}
            contentClassName="grid gap-5 sm:grid-cols-6"
          >
            <PayFields
              defaultType={null}
              defaultRate={null}
              errors={errors}
              onUpdate={onUpdate}
            />
          </SettingsCard>
        )}

        <SettingsCard
          title="Notes"
          data-card="notes"
          className={cardClassName?.notes}
          footer={
            <SettingsCardFooter
              hint={
                formError && (!driver || savingCard === "notes") ? (
                  <span className="text-destructive">{formError}</span>
                ) : driver ? (
                  "Changes are saved for everyone in your organization."
                ) : (
                  "New drivers start as active."
                )
              }
            >
              {!driver && (
                <Link
                  href={base}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Cancel
                </Link>
              )}
              <Button
                type="submit"
                size="sm"
                disabled={pending || (!!driver && !dirtyCards.has("notes"))}
                onClick={markSavingCard}
              >
                {driver
                  ? saveLabel("notes")
                  : pending
                    ? "Saving…"
                    : "Save driver"}{" "}
                <CornerDownLeft />
              </Button>
            </SettingsCardFooter>
          }
        >
          <Field data-invalid={!!errors.notes}>
            <FieldLabel htmlFor="driver-notes" className="sr-only">
              Notes
            </FieldLabel>
            <Textarea
              id="driver-notes"
              name="notes"
              rows={3}
              placeholder="Endorsements, home terminal, preferred lanes…"
              defaultValue={driver?.notes ?? undefined}
              aria-invalid={!!errors.notes}
            />
            <FieldError errors={errors.notes} />
          </Field>
        </SettingsCard>
      </fieldset>
    </form>
  )
}
