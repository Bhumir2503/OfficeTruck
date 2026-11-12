"use client"

import { CornerDownLeft } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { updateLoadAssignment } from "@/app/org/[slug]/loads/actions"
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
import { driverPay, formatPay } from "@/lib/driver-format"
import { loadAssignmentSchema } from "@/lib/schemas/load"

/** Why there's no pay figure, or the figure itself. */
function payHint(load: Load) {
  if (!load.driver) {
    return load.driver_name
      ? `Typed in as "${load.driver_name}". Pick the driver to link the load to them.`
      : "Pick a driver to see their pay for this load."
  }
  const rate = formatPay(load.driver.pay_type, load.driver.pay_rate)
  if (!rate) {
    return `${load.driver.full_name} has no pay rate yet.`
  }
  const pay = driverPay(load.driver, load)
  if (pay === null) {
    return `Add the miles to work out pay at ${rate}.`
  }
  return `Driver pay: ${formatRate(pay)} at ${rate}.`
}

/** The driver and miles on a load. Any member can change them. */
export function LoadAssignmentForm({
  organizationId,
  load,
  drivers,
  driversBase,
}: {
  organizationId: string
  load: Load
  drivers: DriverOption[]
  /** /org/<slug>/drivers */
  driversBase: string
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
          title="Driver and miles"
          description={
            load.driver ? (
              <>
                Driven by{" "}
                <Link
                  href={`${driversBase}/${load.driver.id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {load.driver.full_name}
                </Link>
                .
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
          <Field data-invalid={!!errors.miles}>
            <FieldLabel htmlFor="load-miles">Miles</FieldLabel>
            <Input
              id="load-miles"
              name="miles"
              inputMode="numeric"
              placeholder="e.g. 1,240"
              defaultValue={
                load.miles === null
                  ? undefined
                  : formatMiles(String(load.miles))
              }
              aria-invalid={!!errors.miles}
              onChange={handleMilesInput}
            />
            {errors.miles ? (
              <FieldError errors={errors.miles} />
            ) : (
              <FieldDescription>Used for per-mile pay.</FieldDescription>
            )}
          </Field>
        </SettingsCard>
      </fieldset>
    </form>
  )
}
