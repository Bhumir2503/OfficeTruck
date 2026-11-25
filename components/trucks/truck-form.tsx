"use client"

import { cn } from "cn"
import { CornerDownLeft } from "lucide-react"
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
import { AddRecordPanel } from "@/components/add-record-panel"
import { LeaveGuard } from "@/components/leave-guard"
import { Button } from "@/components/ui/button"
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
export function upperAlnum(maxLength: number, allowSpaces = false) {
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
export function handleStateInput(event: React.ChangeEvent<HTMLInputElement>) {
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
export function handleYearInput(event: React.ChangeEvent<HTMLInputElement>) {
  const input = event.currentTarget
  const cleaned = input.value.replace(/\D/g, "").slice(0, 4)
  if (cleaned !== input.value) {
    input.value = cleaned
  }
}

const thousands = new Intl.NumberFormat("en-US")
/** 80000 → "80,000" for a number field, or nothing. */
const number = (value: number | null | undefined) =>
  value === null || value === undefined ? undefined : thousands.format(value)

/** Digits and commas only, as you type: weights, miles, counts. */
function handleNumberInput(event: React.ChangeEvent<HTMLInputElement>) {
  const input = event.currentTarget
  const cleaned = input.value.replace(/[^\d,]/g, "")
  if (cleaned !== input.value) {
    input.value = cleaned
  }
}

export const money = (value: number | null) =>
  value === null ? undefined : formatCurrency(Number(value).toFixed(2))

/** Owned, leased or owner-operator, filling a hidden `ownership` input. */
export function OwnershipField({
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

/** The form's cards, for the Add truck panel's links. */
const CARD_IDS = {
  details: "truck-card",
  ownership: "ownership-card",
  schedule: "schedule-card",
  costs: "costs-card",
  notes: "notes-card",
}

export type TruckFormCard = "details" | "plate" | "ownership" | "maintenance"

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
  cards,
}: {
  organizationId: string
  /** /org/<slug>/equipment */
  base: string
  drivers: DriverOption[]
  truck?: Truck
  /**
   * Editing on one of the truck page's tabs: the cards to show. The others
   * stay in the form, hidden, so a save sends every field and blanks none.
   */
  cards?: TruckFormCard[]
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const shown = (card: TruckFormCard) => !cards || cards.includes(card)
  // The values as loaded (or last saved), to tell which cards have changes.
  const baseline = useRef<Map<string, string> | null>(null)
  // Set by a save, so the baseline is retaken once saving has finished.
  const rebase = useRef(false)
  const [dirtyCards, setDirtyCards] = useState<Set<TruckFormCard>>(new Set())
  // Adding: whether anything has been entered, to ask before leaving.
  const [entered, setEntered] = useState(false)
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
        // The snapshot waits until saving ends: the form is disabled while
        // saving, and disabled fields are left out of its values.
        rebase.current = true
        setDirtyCards(new Set())
        return
      }

      const result = await createTruck(organizationId, values)
      if ("error" in result) {
        return result.error
      }
      toast.success(`${values.unit_number} added.`)
      setEntered(false)
      router.push(base)
    }
  )

  // The fixed costs, a card when adding. On the truck page they save from
  // their own card.
  const costFields = (className: string) => (
    <>
      <TextField
        name="monthly_payment"
        label="Payment or lease"
        prefix="$"
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

  // After a save, once the form is enabled again, take the new baseline.
  useEffect(() => {
    if (!pending && rebase.current) {
      rebase.current = false
      baseline.current = snapshot(formRef.current)
    }
  }, [pending])

  // A value changed elsewhere (a logged service moves the odometer and the
  // annual inspection) is the new saved value, not an edit.
  const loaded = useRef(truck)
  useEffect(() => {
    const before = loaded.current
    loaded.current = truck
    if (!truck || !before || before === truck || pending || !baseline.current) {
      return
    }
    const now = snapshot(formRef.current)
    for (const [name, value] of now) {
      const key = name as keyof Truck
      if (key in truck && before[key] !== truck[key]) {
        baseline.current.set(name, value)
      }
    }
    checkDirty(formRef.current)
    // Only when the truck's saved values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truck])

  /** Which cards have a field that differs from the baseline. */
  function checkDirty(form: HTMLFormElement | null) {
    if (!form || !baseline.current) {
      return
    }
    const now = snapshot(form)
    if (!truck) {
      const start = baseline.current
      setEntered(
        [...new Set([...start.keys(), ...now.keys()])].some(
          (name) => start.get(name) !== now.get(name)
        )
      )
      return
    }
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
    <>
      {!truck && <LeaveGuard when={entered && !pending} />}
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
                "grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1fr)_20rem] @6xl/main:grid-cols-[minmax(0,1fr)_24rem]"
          }
        >
          <div
            className={
              truck
                ? "contents"
                : "flex min-w-0 flex-col gap-6 @4xl/main:col-start-1 @4xl/main:row-start-1"
            }
          >
            <SettingsCard
              title={truck ? "Truck details" : "Truck"}
              id={CARD_IDS.details}
              className={cn("scroll-mt-6", shown("details") || "hidden")}
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
              <TextField
                name="registered_weight_lbs"
                label="Registered weight"
                inputMode="numeric"
                placeholder="e.g. 80,000"
                suffix="lbs"
                defaultValue={number(truck?.registered_weight_lbs)}
                errors={errors}
                className="sm:col-span-3"
                onChange={handleNumberInput}
              />
              <TextField
                name="axles"
                label="Axles"
                inputMode="numeric"
                placeholder="e.g. 3"
                defaultValue={truck?.axles ?? undefined}
                errors={errors}
                className="sm:col-span-3"
                onChange={handleNumberInput}
              />
            </SettingsCard>

            <SettingsCard
              title="Plate and compliance"
              id={TRUCK_DATES_ID}
              className={cn("scroll-mt-6", shown("plate") || "hidden")}
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
              id={CARD_IDS.ownership}
              className={cn("scroll-mt-6", shown("ownership") || "hidden")}
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

            <SettingsCard
              title="Maintenance schedule"
              id={CARD_IDS.schedule}
              className={cn("scroll-mt-6", shown("maintenance") || "hidden")}
              data-card="maintenance"
              footer={cardFooter("maintenance")}
              contentClassName="grid gap-5 sm:grid-cols-6"
            >
              <TextField
                name="odometer"
                label="Odometer"
                inputMode="numeric"
                placeholder="e.g. 412,350"
                suffix="miles"
                defaultValue={number(truck?.odometer)}
                errors={errors}
                className="sm:col-span-3"
                onChange={handleNumberInput}
              />
              <DateField
                id={fieldId("odometer_on")}
                name="odometer_on"
                label="Read on"
                defaultValue={truck?.odometer_on}
                errors={errors.odometer_on}
                onUpdate={onUpdate}
                className="sm:col-span-3"
              />
              <TextField
                name="pm_interval_miles"
                label="Service every"
                inputMode="numeric"
                placeholder="e.g. 15,000"
                suffix="miles"
                defaultValue={number(truck?.pm_interval_miles)}
                errors={errors}
                className="sm:col-span-3"
                onChange={handleNumberInput}
              />
              <TextField
                name="pm_interval_days"
                label="Or every"
                inputMode="numeric"
                placeholder="e.g. 90"
                suffix="days"
                defaultValue={truck?.pm_interval_days ?? undefined}
                errors={errors}
                className="sm:col-span-3"
                onChange={handleNumberInput}
                hint="Whichever comes first, counted from the last preventive service logged."
              />
            </SettingsCard>
            {!truck && (
              // On the truck page these save from their own cards.
              <>
                <SettingsCard
                  title="Monthly fixed costs"
                  id={CARD_IDS.costs}
                  className="@container scroll-mt-6"
                  // On one line once the card is wide enough for the amounts; stacked on a phone.
                  contentClassName="grid gap-5 @md:grid-cols-3 @md:items-end"
                >
                  {costFields("")}
                </SettingsCard>
                <SettingsCard
                  title="Notes"
                  id={CARD_IDS.notes}
                  className="scroll-mt-6"
                >
                  {notesField(3)}
                </SettingsCard>
              </>
            )}
          </div>

          {!truck && (
            // Beside the cards, what's filled in and saving stay in view; on
            // a phone they come after them, as on New load.
            <aside className="@4xl/main:sticky @4xl/main:top-6 @4xl/main:col-start-2 @4xl/main:row-start-1">
              <AddRecordPanel
                eyebrow="New truck"
                placeholderTitle="Add a truck"
                nameField="unit_number"
                sections={[
                  { id: CARD_IDS.details, label: "Truck" },
                  { id: TRUCK_DATES_ID, label: "Plate and compliance" },
                  { id: CARD_IDS.ownership, label: "Ownership and driver" },
                  { id: CARD_IDS.schedule, label: "Maintenance schedule" },
                  { id: CARD_IDS.costs, label: "Fixed costs" },
                  { id: CARD_IDS.notes, label: "Notes", optional: true },
                ]}
                hint="Only the unit number is needed to save. Anything else can be added from its page later."
                submitLabel="Save truck"
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
