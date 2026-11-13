"use client"

import { CornerDownLeft } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { updateLoadAssignment } from "@/app/org/[slug]/loads/actions"
import { TruckSelect } from "@/components/loads/truck-select"
import {
  DriverSelect,
  formatMiles,
  handleMilesInput,
} from "@/components/loads/driver-select"
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
import { useZodForm } from "@/hooks/use-zod-form"
import { formatRate } from "@/lib/load-format"
import type { DriverOption } from "@/lib/drivers"
import type { Load } from "@/lib/loads"
import type { TruckOption } from "@/lib/trucks"
import { formatPay, loadDriverPay } from "@/lib/driver-format"
import { loadAssignmentSchema } from "@/lib/schemas/load"

/** Why there's no pay figure, or the figure itself. */
function payHint(load: Load) {
  if (!load.driver) {
    return load.driver_name
      ? `Typed in as "${load.driver_name}". Pick the driver to link the load to them.`
      : "Pick a driver to see their pay for this load."
  }
  const locked = formatPay(load.driver_pay_type, load.driver_pay_rate)
  if (!locked) {
    return `${load.driver.full_name} has no pay rate yet. It's filled in when you save once they have one.`
  }
  const pay = loadDriverPay(load)
  const amount =
    pay === null
      ? `Add the miles to work out pay at ${locked}`
      : `Driver pay: ${formatRate(pay)} at ${locked}`
  // The rate on the load stays as it was when the driver was assigned.
  const current = formatPay(load.driver.pay_type, load.driver.pay_rate)
  return current && current !== locked
    ? `${amount}, locked when assigned. Their rate is now ${current}.`
    : `${amount}, locked when assigned.`
}

function MilesField({
  name,
  label,
  hint,
  value,
  errors,
}: {
  name: "miles" | "empty_miles"
  label: string
  hint: string
  value: number | null
  errors?: { message: string }[]
}) {
  const id = `load-${name.replace("_", "-")}`
  return (
    <Field data-invalid={!!errors}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        inputMode="numeric"
        placeholder={name === "miles" ? "e.g. 1,240" : "e.g. 85"}
        defaultValue={value === null ? undefined : formatMiles(String(value))}
        aria-invalid={!!errors}
        onChange={handleMilesInput}
      />
      {errors ? (
        <FieldError errors={errors} />
      ) : (
        <FieldDescription>{hint}</FieldDescription>
      )}
    </Field>
  )
}

/** The truck, driver and miles on a load. Any member can change them. */
export function LoadAssignmentForm({
  organizationId,
  load,
  drivers,
  driversBase,
  trucks,
  trucksBase,
}: {
  organizationId: string
  load: Load
  drivers: DriverOption[]
  /** /org/<slug>/drivers */
  driversBase: string
  trucks: TruckOption[]
  /** /org/<slug>/equipment */
  trucksBase: string
}) {
  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    loadAssignmentSchema,
    async (values) => {
      const result = await updateLoadAssignment(organizationId, load.id, values)
      if ("error" in result) {
        return result.error
      }
      toast.success(`Load ${load.reference} saved.`)
    }
  )

  return (
    <form {...formProps} autoComplete="off">
      <fieldset disabled={pending}>
        <SettingsCard
          title="Truck, driver and miles"
          description={
            load.driver || load.truck_link ? (
              <>
                {load.truck_link && (
                  <>
                    <Link
                      href={`${trucksBase}/${load.truck_link.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {load.truck_link.unit_number}
                    </Link>
                    {load.driver ? ", driven by " : "."}
                  </>
                )}
                {load.driver && (
                  <>
                    {!load.truck_link && "Driven by "}
                    <Link
                      href={`${driversBase}/${load.driver.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {load.driver.full_name}
                    </Link>
                    .
                  </>
                )}
              </>
            ) : (
              "Who's running this load, and how far."
            )
          }
          contentClassName="grid gap-5 sm:grid-cols-2"
          footer={
            <SettingsCardFooter
              hint={
                formError ? (
                  <span className="text-destructive">{formError}</span>
                ) : (
                  payHint(load)
                )
              }
            >
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save"} <CornerDownLeft />
              </Button>
            </SettingsCardFooter>
          }
        >
          <Field data-invalid={!!errors.truck_id}>
            <FieldLabel htmlFor="load-truck-id">Truck</FieldLabel>
            <TruckSelect
              id="load-truck-id"
              trucks={trucks}
              defaultValue={load.truck_id}
              invalid={!!errors.truck_id}
              onUpdate={revalidate}
            />
            {errors.truck_id ? (
              <FieldError errors={errors.truck_id} />
            ) : (
              !load.truck_link &&
              load.truck && (
                <FieldDescription>
                  Typed in as &ldquo;{load.truck}&rdquo;.
                </FieldDescription>
              )
            )}
          </Field>
          <Field data-invalid={!!errors.driver_id}>
            <FieldLabel htmlFor="load-driver-id">Driver</FieldLabel>
            <DriverSelect
              id="load-driver-id"
              drivers={drivers}
              defaultValue={load.driver_id}
              invalid={!!errors.driver_id}
              onUpdate={revalidate}
            />
            <FieldError errors={errors.driver_id} />
          </Field>
          <MilesField
            name="miles"
            label="Loaded miles"
            hint="Pickup to delivery. Used for per-mile pay."
            value={load.miles}
            errors={errors.miles}
          />
          <MilesField
            name="empty_miles"
            label="Empty miles"
            hint="Deadhead to the pickup. Counts toward cost per mile."
            value={load.empty_miles}
            errors={errors.empty_miles}
          />
        </SettingsCard>
      </fieldset>
    </form>
  )
}
