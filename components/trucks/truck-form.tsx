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
import { EldBadge } from "@/components/trucks/truck-badges"
import { Button, buttonVariants } from "@/components/ui/button"
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

function TextField({
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

const money = (value: number | null) =>
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
    <Field data-invalid={!!errors} className="sm:col-span-6">
      <FieldLabel id="truck-ownership-label">Ownership</FieldLabel>
      <input ref={hiddenRef} type="hidden" name="ownership" value={value} />
      <ToggleGroup
        aria-labelledby="truck-ownership-label"
        variant="outline"
        size="sm"
        spacing={1}
        className="flex-wrap"
        value={[value || "none"]}
        onValueChange={(next: string[]) => {
          if (next[0] !== undefined) {
            setValue(next[0] === "none" ? "" : (next[0] as Ownership))
          }
        }}
      >
        <ToggleGroupItem value="none">Not set</ToggleGroupItem>
        {OWNERSHIPS.map((ownership) => (
          <ToggleGroupItem key={ownership} value={ownership}>
            {OWNERSHIP_LABELS[ownership]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {errors ? (
        <FieldError errors={errors} />
      ) : (
        <FieldDescription>
          Owner-operator means a driver&apos;s own truck, leased on to you.
        </FieldDescription>
      )}
    </Field>
  )
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
  const [motiveId, setMotiveId] = useState(truck?.motive_vehicle_id ?? "")
  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    truckSchema,
    async (values) => {
      if (truck) {
        const result = await updateTruck(organizationId, truck.id, values)
        if ("error" in result) {
          return result.error
        }
        toast.success(`${values.unit_number} saved.`)
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

  return (
    <form {...formProps} autoComplete="off">
      <fieldset disabled={pending} className="flex flex-col gap-6">
        <SettingsCard
          title={truck ? "Truck details" : "Truck"}
          description="The unit number is what your team calls it."
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
            hint="Matches IFTA rows when there's no ELD link."
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
          description="You'll see a warning 60, 30 and 7 days before each one is due."
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
            onUpdate={revalidate}
            className="sm:col-span-2"
          />
          <DateField
            id={fieldId("registration_expires_on")}
            name="registration_expires_on"
            label="Registration or IRP expires"
            defaultValue={truck?.registration_expires_on}
            errors={errors.registration_expires_on}
            onUpdate={revalidate}
            className="sm:col-span-2"
          />
          <DateField
            id={fieldId("annual_inspection_on")}
            name="annual_inspection_on"
            label="Last annual inspection"
            hint="Due again a year later."
            defaultValue={truck?.annual_inspection_on}
            errors={errors.annual_inspection_on}
            onUpdate={revalidate}
            className="sm:col-span-2"
          />
        </SettingsCard>

        <SettingsCard
          title="Ownership and driver"
          contentClassName="grid gap-5 sm:grid-cols-6"
        >
          <OwnershipField
            defaultValue={truck?.ownership ?? null}
            errors={errors.ownership}
            onUpdate={revalidate}
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
              onUpdate={revalidate}
            />
            {errors.default_driver_id ? (
              <FieldError errors={errors.default_driver_id} />
            ) : (
              <FieldDescription>
                Filled in on new loads with this truck.
              </FieldDescription>
            )}
          </Field>
        </SettingsCard>

        <SettingsCard
          title="ELD"
          description="Links this truck to Motive, so its miles by state land here for IFTA."
          action={<EldBadge connected={motiveId.trim() !== ""} />}
          contentClassName="grid gap-5 sm:grid-cols-6"
        >
          <TextField
            name="motive_vehicle_id"
            label="Motive vehicle ID"
            placeholder="e.g. 1234567"
            value={motiveId}
            errors={errors}
            className="sm:col-span-3"
            onChange={(event) => setMotiveId(event.currentTarget.value)}
            hint="The vehicle's ID in Motive. Leave blank if it isn't on Motive."
          />
        </SettingsCard>

        <SettingsCard
          title="Fixed costs"
          description="Spread over the truck's miles, empty miles included, for cost per mile."
          contentClassName="grid gap-5 sm:grid-cols-6"
        >
          <TextField
            name="monthly_payment"
            label="Payment or lease"
            prefix="$"
            suffix="/ month"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={money(truck?.monthly_payment ?? null)}
            errors={errors}
            className="sm:col-span-2"
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
            className="sm:col-span-2"
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
            className="sm:col-span-2"
            onChange={handleCurrencyInput}
            onKeyDown={handleCurrencyKeyDown}
            onBlur={handleCurrencyBlur}
            hint="Permits, ELD fees, parking."
          />
        </SettingsCard>

        <SettingsCard
          title="Notes"
          footer={
            <SettingsCardFooter
              hint={
                formError ? (
                  <span className="text-destructive">{formError}</span>
                ) : truck ? (
                  "Changes are saved for everyone in your organization."
                ) : (
                  "New trucks start as active."
                )
              }
            >
              {!truck && (
                <Link
                  href={base}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Cancel
                </Link>
              )}
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : truck ? "Save changes" : "Save truck"}{" "}
                <CornerDownLeft />
              </Button>
            </SettingsCardFooter>
          }
        >
          <Field data-invalid={!!errors.notes}>
            <FieldLabel htmlFor="truck-notes" className="sr-only">
              Notes
            </FieldLabel>
            <Textarea
              id="truck-notes"
              name="notes"
              rows={3}
              placeholder="Trailer it usually pulls, service history, quirks…"
              defaultValue={truck?.notes ?? undefined}
              aria-invalid={!!errors.notes}
            />
            <FieldError errors={errors.notes} />
          </Field>
        </SettingsCard>
      </fieldset>
    </form>
  )
}
