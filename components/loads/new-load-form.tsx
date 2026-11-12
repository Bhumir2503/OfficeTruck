"use client"

import { cn } from "cn"
import { CornerDownLeft } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { createLoad } from "@/app/org/[slug]/loads/actions"
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
import { DateTimeField } from "@/components/loads/date-time-field"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  handleCurrencyBlur,
  handleCurrencyInput,
  handleCurrencyKeyDown,
} from "@/lib/currency"
import { loadSchema, type LoadInput } from "@/lib/schemas/load"

type Name = keyof LoadInput
type Errors = Partial<Record<Name, { message: string }[]>>

function TextField({
  name,
  label,
  errors,
  hint,
  className,
  prefix,
  ...input
}: {
  name: Name
  label: string
  errors: Errors
  hint?: string
  className?: string
  /** Shown inside the input, before the value, e.g. "$". */
  prefix?: string
} & Omit<React.ComponentProps<"input">, "name" | "className" | "prefix">) {
  const id = `load-${name.replaceAll("_", "-")}`
  const fieldErrors = errors[name]
  return (
    <Field data-invalid={!!fieldErrors} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {prefix ? (
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
            {prefix}
          </span>
          <Input
            id={id}
            name={name}
            aria-invalid={!!fieldErrors}
            className="pl-6"
            {...input}
          />
        </div>
      ) : (
        <Input id={id} name={name} aria-invalid={!!fieldErrors} {...input} />
      )}
      {fieldErrors ? (
        <FieldError errors={fieldErrors} />
      ) : (
        hint && <FieldDescription>{hint}</FieldDescription>
      )}
    </Field>
  )
}

function StopFields({
  stop,
  errors,
  revalidate,
}: {
  stop: "pickup" | "delivery"
  errors: Errors
  revalidate: (form: HTMLFormElement | null) => void
}) {
  const stopLabel = stop === "pickup" ? "Pickup" : "Delivery"
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <TextField
        name={`${stop}_location`}
        label="Location"
        placeholder={
          stop === "pickup"
            ? "e.g. Walmart DC 6094, Bentonville, AR"
            : "e.g. Kroger, Dallas, TX"
        }
        errors={errors}
        className="sm:col-span-2"
      />
      <DateTimeField
        name={`${stop}_start`}
        label="From"
        stopLabel={stopLabel}
        hint="Local time at the stop."
        defaultTime="08:00"
        errors={errors[`${stop}_start`]}
        onUpdate={revalidate}
      />
      <DateTimeField
        name={`${stop}_end`}
        label="To (optional)"
        stopLabel={stopLabel}
        hint="Leave the date blank for a set appointment."
        defaultTime="17:00"
        errors={errors[`${stop}_end`]}
        onUpdate={revalidate}
      />
    </div>
  )
}

export function NewLoadForm({
  organizationId,
  base,
}: {
  organizationId: string
  /** /org/<slug>/loads */
  base: string
}) {
  const router = useRouter()
  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    loadSchema,
    async (values) => {
      const result = await createLoad(organizationId, values)
      if ("error" in result) {
        return result.error
      }
      toast.success(`Load ${values.reference} added.`)
      router.push(base)
    }
  )

  return (
    <form {...formProps} autoComplete="off">
      <fieldset disabled={pending} className="flex flex-col gap-6">
        <SettingsCard
          title="Load"
          description="From the rate confirmation."
          contentClassName="grid gap-5 sm:grid-cols-6"
        >
          <TextField
            name="reference"
            label="Load number"
            placeholder="e.g. 4471023"
            errors={errors}
            className="sm:col-span-2"
            autoFocus
          />
          <TextField
            name="broker_name"
            label="Broker"
            placeholder="e.g. TQL"
            errors={errors}
            className="sm:col-span-2"
          />
          <TextField
            name="rate"
            label="Rate (USD)"
            prefix="$"
            inputMode="decimal"
            placeholder="2,450.00"
            errors={errors}
            className="sm:col-span-2"
            onChange={handleCurrencyInput}
            onKeyDown={handleCurrencyKeyDown}
            onBlur={handleCurrencyBlur}
          />
        </SettingsCard>

        <SettingsCard title="Pickup">
          <StopFields stop="pickup" errors={errors} revalidate={revalidate} />
        </SettingsCard>

        <SettingsCard title="Delivery">
          <StopFields stop="delivery" errors={errors} revalidate={revalidate} />
        </SettingsCard>

        <SettingsCard
          title="Assignment"
          description="Optional. You can fill these in later."
          contentClassName="grid gap-5 sm:grid-cols-2"
          footer={
            <SettingsCardFooter
              hint={
                formError ? (
                  <span className="text-destructive">{formError}</span>
                ) : (
                  "New loads start as booked."
                )
              }
            >
              <Link
                href={base}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" })
                )}
              >
                Cancel
              </Link>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save load"} <CornerDownLeft />
              </Button>
            </SettingsCardFooter>
          }
        >
          <TextField
            name="driver_name"
            label="Driver"
            placeholder="e.g. Marcus Hill"
            errors={errors}
          />
          <TextField
            name="truck"
            label="Truck"
            placeholder="e.g. Unit 112"
            errors={errors}
          />
          <Field data-invalid={!!errors.notes} className="sm:col-span-2">
            <FieldLabel htmlFor="load-notes">Notes</FieldLabel>
            <Textarea
              id="load-notes"
              name="notes"
              rows={3}
              placeholder="Commodity, weight, lumper, special instructions…"
              aria-invalid={!!errors.notes}
            />
            <FieldError errors={errors.notes} />
          </Field>
        </SettingsCard>
      </fieldset>
    </form>
  )
}
