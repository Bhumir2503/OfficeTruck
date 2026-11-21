"use client"

import { CornerDownLeft } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { createTruck, updateTruck } from "@/app/org/[slug]/equipment/actions"
import { DateField } from "@/components/drivers/date-field"
import { DriverSelect } from "@/components/loads/driver-select"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TRUCK_DATES_ID } from "@/components/trucks/truck-next-action"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  formatCurrency,
  handleCurrencyBlur,
  handleCurrencyInput,
  handleCurrencyKeyDown,
} from "@/lib/currency"
import type { DriverOption } from "@/lib/drivers"
import {
  OWNERSHIPS,
  OWNERSHIP_LABELS,
  truckSchema,
  type Ownership,
  type TruckInput,
} from "@/lib/schemas/truck"
import type { Truck } from "@/lib/trucks"

type Name = keyof TruckInput
type Errors = Partial<Record<Name, { message: string }[]>>

const fieldId = (name: Name) => `truck-${name.replaceAll("_", "-")}`

export function TextField({
  name,
  label,
  errors,
  hint,
  className,
  prefix,
  suffix,
  ...input
}: {
  name: Name
  label: string
  errors: Errors
  hint?: React.ReactNode
  className?: string
  prefix?: string
  suffix?: string
} & Omit<React.ComponentProps<"input">, "name" | "className" | "prefix">) {
  const id = fieldId(name)
  const fieldErrors = errors[name]
  const control = (
    <Input
      id={id}
      name={name}
      aria-invalid={!!fieldErrors}
      className={[prefix && "pl-6", suffix && "pr-16"]
        .filter(Boolean)
        .join(" ")}
      {...input}
    />
  )
  return (
    <Field data-invalid={!!fieldErrors} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {prefix || suffix ? (
        <div className="relative">
          {prefix && (
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
              {prefix}
            </span>
          )}
          {control}
          {suffix && (
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">
              {suffix}
            </span>
          )}
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

/** Uppercase letters and digits only, as you type: VINs and plates. */
function upperAlnum(maxLength: number, allowSpaces = false) {
  return (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const cleaned = input.value
      .toUpperCase()
      .replace(allowSpaces ? /[^A-Z0-9 -]/g : /[^A-Z0-9]/g, "")
      .slice(0, maxLength)
    if (cleaned !== input.value) {
      const caret = Math.min(
        input.selectionStart ?? cleaned.length,
        cleaned.length
      )
      input.value = cleaned
      input.setSelectionRange(caret, caret)
    }
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

/** Digits only, at most 4: the model year. */
function handleYearInput(event: React.ChangeEvent<HTMLInputElement>) {
  const input = event.currentTarget
  const cleaned = input.value.replace(/\D/g, "").slice(0, 4)
  if (cleaned !== input.value) {
    input.value = cleaned
  }
}

export const money = (value: number | null) =>
  value === null ? undefined : formatCurrency(Number(value).toFixed(2))

/** Owned, leased or owner-operator, filling a hidden `ownership` input. */
function OwnershipField({
  defaultValue,
  errors,
  onUpdate,
}: {
  defaultValue: Ownership | null
  errors?: { message: string }[]
  onUpdate: (form: HTMLFormElement | null) => void
}) {
  const [value, setValue] = useState<Ownership | "">(defaultValue ?? "")
  const hiddenRef = useRef<HTMLInputElement>(null)
  const firstRender = useRef(true)

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
    <Field data-invalid={!!errors} className="sm:col-span-3">
      <FieldLabel htmlFor="truck-ownership">Ownership</FieldLabel>
      <input ref={hiddenRef} type="hidden" name="ownership" value={value} />
      <Select
        value={value || "none"}
        onValueChange={(next) =>
          setValue(!next || next === "none" ? "" : (next as Ownership))
        }
        items={[
          { value: "none", label: "Not set" },
          ...OWNERSHIPS.map((ownership) => ({
            value: ownership,
            label: OWNERSHIP_LABELS[ownership],
          })),
        ]}
      >
        <SelectTrigger
          id="truck-ownership"
          aria-invalid={!!errors}
          className="w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            <span className="text-muted-foreground">Not set</span>
          </SelectItem>
          {OWNERSHIPS.map((ownership) => (
            <SelectItem key={ownership} value={ownership}>
              {OWNERSHIP_LABELS[ownership]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError errors={errors} />
    </Field>
  )
}

type TruckFormCard = "details" | "plate" | "ownership"

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
    TruckFormCard | undefined
}

/**
 * The fields for a truck. With `truck` it edits that truck and stays on the
 * page; without, it adds a new one and goes back to the list.
 */
export function TruckForm({
  organizationId,
  base,
  drivers,
  truck,
}: {
  organizationId: string
  /** /org/<slug>/equipment */
  base: string
  drivers: DriverOption[]
  truck?: Truck
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  // The values as loaded (or last saved), to tell which cards have changes.
  const baseline = useRef<Map<string, string> | null>(null)
  const [dirtyCards, setDirtyCards] = useState<Set<TruckFormCard>>(new Set())
  // Every card saves the same form; remember which one was pressed so only
  // it says "Saving…" and shows errors.
  const [savingCard, setSavingCard] = useState<TruckFormCard>("details")
  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    truckSchema,
    async (values) => {
      if (truck) {
        const result = await updateTruck(organizationId, truck.id, values)
        if ("error" in result) {
          return result.error
        }
        toast.success(`${values.unit_number} saved.`)
        // What's saved is the new starting point, so the buttons go quiet.
        baseline.current = snapshot(formRef.current)
        setDirtyCards(new Set())
        return
      }

      const result = await createTruck(organizationId, values)
      if ("error" in result) {
        return result.error
      }
      toast.success(`${values.unit_number} added.`)
      router.push(base)
    }
  )

  // The fixed costs, beside the form when adding. On the truck page they
  // save from their own box.
  const costFields = (className: string) => (
    <>
      <TextField
        name="monthly_payment"
        label="Payment or lease"
        prefix="$"
        suffix="/ month"
        inputMode="decimal"
        placeholder="0.00"
        defaultValue={money(truck?.monthly_payment ?? null)}
        errors={errors}
        className={className}
        onChange={handleCurrencyInput}
        onKeyDown={handleCurrencyKeyDown}
        onBlur={handleCurrencyBlur}
      />
      <TextField
        name="monthly_insurance"
        label="Insurance"
        prefix="$"
        suffix="/ month"
        inputMode="decimal"
        placeholder="0.00"
        defaultValue={money(truck?.monthly_insurance ?? null)}
        errors={errors}
        className={className}
        onChange={handleCurrencyInput}
        onKeyDown={handleCurrencyKeyDown}
        onBlur={handleCurrencyBlur}
      />
      <TextField
        name="monthly_other_costs"
        label="Other fixed costs"
        prefix="$"
        suffix="/ month"
        inputMode="decimal"
        placeholder="0.00"
        defaultValue={money(truck?.monthly_other_costs ?? null)}
        errors={errors}
        className={className}
        onChange={handleCurrencyInput}
        onKeyDown={handleCurrencyKeyDown}
        onBlur={handleCurrencyBlur}
      />
    </>
  )

  const notesField = (rows: number) => (
    <Field data-invalid={!!errors.notes}>
      <FieldLabel htmlFor="truck-notes" className="sr-only">
        Notes
      </FieldLabel>
      <Textarea
        id="truck-notes"
        name="notes"
        rows={rows}
        placeholder="Trailer it usually pulls, service history, quirks…"
        defaultValue={truck?.notes ?? undefined}
        aria-invalid={!!errors.notes}
      />
      <FieldError errors={errors.notes} />
    </Field>
  )

  useEffect(() => {
    baseline.current = snapshot(formRef.current)
  }, [])

  /** Which cards have a field that differs from the baseline. */
  function checkDirty(form: HTMLFormElement | null) {
    if (!form || !baseline.current || !truck) {
      return
    }
    const now = snapshot(form)
    const dirty = new Set<TruckFormCard>()
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

  // Enter in a field would press the form's first save button. Save from
  // the field's own card instead, if it has changes.
  function onKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    const target = event.target
    if (
      !truck ||
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

  const cardFooter = (card: TruckFormCard) =>
    truck ? (
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
    <form
      {...formProps}
      ref={formRef}
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
          truck
            ? "flex flex-col gap-6"
            : // Adding: the cards, with costs, notes and saving beside them
              // in view, as on Add driver and New load.
              "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]"
        }
      >
        <div
          className={
            truck
              ? "contents"
              : "flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1"
          }
        >
          <SettingsCard
            title={truck ? "Truck details" : "Truck"}
            data-card="details"
            footer={cardFooter("details")}
            contentClassName="grid gap-5 sm:grid-cols-6"
          >
            <TextField
              name="unit_number"
              label="Unit number"
              placeholder="e.g. Truck 12"
              defaultValue={truck?.unit_number}
              errors={errors}
              className="sm:col-span-2"
              autoFocus={!truck}
            />
            <TextField
              name="vin"
              label="VIN"
              placeholder="17 characters"
              defaultValue={truck?.vin ?? undefined}
              errors={errors}
              className="sm:col-span-4"
              onChange={upperAlnum(17)}
            />
            <TextField
              name="year"
              label="Year"
              inputMode="numeric"
              placeholder="e.g. 2021"
              defaultValue={truck?.year ?? undefined}
              errors={errors}
              className="sm:col-span-2"
              onChange={handleYearInput}
            />
            <TextField
              name="make"
              label="Make"
              placeholder="e.g. Freightliner"
              defaultValue={truck?.make ?? undefined}
              errors={errors}
              className="sm:col-span-2"
            />
            <TextField
              name="model"
              label="Model"
              placeholder="e.g. Cascadia"
              defaultValue={truck?.model ?? undefined}
              errors={errors}
              className="sm:col-span-2"
            />
          </SettingsCard>

          <SettingsCard
            title="Plate and compliance"
            id={TRUCK_DATES_ID}
            className="scroll-mt-6"
            data-card="plate"
            footer={cardFooter("plate")}
            contentClassName="grid gap-5 sm:grid-cols-6"
          >
            <TextField
              name="plate_number"
              label="Plate number"
              placeholder="e.g. R123456"
              defaultValue={truck?.plate_number ?? undefined}
              errors={errors}
              className="sm:col-span-4"
              onChange={upperAlnum(15, true)}
            />
            <TextField
              name="plate_state"
              label="Plate state"
              placeholder="TX"
              autoCapitalize="characters"
              defaultValue={truck?.plate_state ?? undefined}
              errors={errors}
              className="sm:col-span-2"
              onChange={handleStateInput}
            />
            <DateField
              id={fieldId("plate_expires_on")}
              name="plate_expires_on"
              label="Plate expires"
              defaultValue={truck?.plate_expires_on}
              errors={errors.plate_expires_on}
              onUpdate={onUpdate}
              className="sm:col-span-2"
            />
            <DateField
              id={fieldId("registration_expires_on")}
              name="registration_expires_on"
              label="Registration or IRP expires"
              defaultValue={truck?.registration_expires_on}
              errors={errors.registration_expires_on}
              onUpdate={onUpdate}
              className="sm:col-span-2"
            />
            <DateField
              id={fieldId("annual_inspection_on")}
              name="annual_inspection_on"
              label="Last annual inspection"
              defaultValue={truck?.annual_inspection_on}
              errors={errors.annual_inspection_on}
              onUpdate={onUpdate}
              className="sm:col-span-2"
            />
          </SettingsCard>

          <SettingsCard
            title="Ownership and driver"
            data-card="ownership"
            footer={cardFooter("ownership")}
            contentClassName="grid gap-5 sm:grid-cols-6"
          >
            <OwnershipField
              defaultValue={truck?.ownership ?? null}
              errors={errors.ownership}
              onUpdate={onUpdate}
            />
            <Field
              data-invalid={!!errors.default_driver_id}
              className="sm:col-span-3"
            >
              <FieldLabel htmlFor={fieldId("default_driver_id")}>
                Default driver
              </FieldLabel>
              <DriverSelect
                id={fieldId("default_driver_id")}
                name="default_driver_id"
                drivers={drivers}
                defaultValue={truck?.default_driver_id}
                invalid={!!errors.default_driver_id}
                onUpdate={onUpdate}
              />
              <FieldError errors={errors.default_driver_id} />
            </Field>
            <TextField
              name="home_base"
              label="Home base"
              placeholder="e.g. 4100 Industrial Blvd, Fort Worth, TX"
              defaultValue={truck?.home_base ?? undefined}
              errors={errors}
              className="sm:col-span-6"
            />
          </SettingsCard>
        </div>

        {!truck && (
          // Beside the cards, costs, notes and saving stay in view; on a
          // phone they come after them, as on Add driver.
          <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1">
            <section className="flex flex-col gap-4 rounded-xl border bg-card px-5 pt-4 pb-5 text-card-foreground shadow-xs">
              <h4 className="font-semibold">Fixed costs</h4>
              <div className="grid gap-4">{costFields("")}</div>
            </section>
            <section className="flex flex-col gap-3 rounded-xl border bg-card px-5 pt-4 pb-5 text-card-foreground shadow-xs">
              <h4 className="font-semibold">Notes</h4>
              {notesField(4)}
            </section>
            <section className="rounded-xl border bg-card px-5 pt-4 pb-5 text-card-foreground shadow-xs">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                New truck
              </p>
              <h4 className="mt-1 text-xl font-semibold tracking-tight">
                Add a truck
              </h4>
              <p className="mt-2 text-sm text-muted-foreground">
                Only the unit number is needed to save.
              </p>
              <div className="mt-5 flex flex-col gap-2 border-t pt-5">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={pending}
                >
                  {pending ? "Saving…" : "Save truck"} <CornerDownLeft />
                </Button>
                <Link
                  href={base}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Cancel
                </Link>
                {formError && (
                  <p role="alert" className="text-sm text-destructive">
                    {formError}
                  </p>
                )}
              </div>
            </section>
          </aside>
        )}
      </fieldset>
    </form>
  )
}
