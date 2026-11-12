"use client"

import { CornerDownLeft } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
import type { Driver } from "@/lib/drivers"
import { formatPhone, handlePhoneInput, handlePhoneKeyDown } from "@/lib/phone"
import { driverSchema, type DriverInput } from "@/lib/schemas/driver"

type Name = keyof DriverInput
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

/** Uppercases as you type, keeping the caret where it was. */
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
}: {
  organizationId: string
  /** /org/<slug>/drivers */
  base: string
  driver?: Driver
}) {
  const router = useRouter()
  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    driverSchema,
    async (values) => {
      if (driver) {
        const result = await updateDriver(organizationId, driver.id, values)
        if ("error" in result) {
          return result.error
        }
        toast.success(`${values.full_name} saved.`)
        return
      }

      const result = await createDriver(organizationId, values)
      if ("error" in result) {
        return result.error
      }
      toast.success(`${values.full_name} added.`)
      router.push(base)
    }
  )

  return (
    <form {...formProps} autoComplete="off">
      <fieldset disabled={pending} className="flex flex-col gap-6">
        <SettingsCard
          title={driver ? "Driver details" : "Driver"}
          description="Name and how to reach them."
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
            label="Phone"
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
        </SettingsCard>

        <SettingsCard
          title="Compliance"
          description="You'll see a warning 60, 30 and 7 days before each one is due."
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
          <DateField
            id={fieldId("cdl_expires_on")}
            name="cdl_expires_on"
            label="CDL expires"
            hint="The expiration date printed on the license."
            defaultValue={driver?.cdl_expires_on}
            errors={errors.cdl_expires_on}
            onUpdate={revalidate}
            className="sm:col-span-3"
          />
          <DateField
            id={fieldId("medical_card_expires_on")}
            name="medical_card_expires_on"
            label="Medical card expires"
            hint="From the DOT medical examiner's certificate."
            defaultValue={driver?.medical_card_expires_on}
            errors={errors.medical_card_expires_on}
            onUpdate={revalidate}
            className="sm:col-span-3"
          />
          <DateField
            id={fieldId("annual_review_on")}
            name="annual_review_on"
            label="Last annual review"
            hint="Review of the driving record. Due again a year later."
            defaultValue={driver?.annual_review_on}
            errors={errors.annual_review_on}
            onUpdate={revalidate}
            className="sm:col-span-3"
          />
          <DateField
            id={fieldId("clearinghouse_query_on")}
            name="clearinghouse_query_on"
            label="Last Clearinghouse query"
            hint="The yearly limited query. Due again a year later."
            defaultValue={driver?.clearinghouse_query_on}
            errors={errors.clearinghouse_query_on}
            onUpdate={revalidate}
            className="sm:col-span-3"
          />
        </SettingsCard>

        <SettingsCard
          title="Pay"
          description="Used to work out profit per load."
          contentClassName="grid gap-5 sm:grid-cols-6"
        >
          <PayFields
            defaultType={driver?.pay_type ?? null}
            defaultRate={driver?.pay_rate ?? null}
            errors={errors}
            onUpdate={revalidate}
          />
        </SettingsCard>

        <SettingsCard
          title="Notes"
          footer={
            <SettingsCardFooter
              hint={
                formError ? (
                  <span className="text-destructive">{formError}</span>
                ) : driver ? (
                  "Changes are saved for everyone in your organization."
                ) : (
                  "New drivers start as active. Add photos after saving."
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
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : driver ? "Save changes" : "Save driver"}{" "}
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
