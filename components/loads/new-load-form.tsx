"use client"

import { cn } from "cn"
import { CornerDownLeft } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import { BrokerFields } from "@/components/loads/broker-fields"
import { ChargesEditor } from "@/components/loads/charges-editor"
import { FreightFields, LoadTextField } from "@/components/loads/freight-fields"
import { StopsEditor } from "@/components/loads/stops-editor"
import { TruckSelect } from "@/components/loads/truck-select"
import {
  DriverSelect,
  handleMilesInput,
} from "@/components/loads/driver-select"
import { useZodForm } from "@/hooks/use-zod-form"
import type { BrokerOption } from "@/lib/brokers"
import type { DriverOption } from "@/lib/drivers"
import type { TruckOption } from "@/lib/trucks"
import { loadSchema } from "@/lib/schemas/load"

const TextField = LoadTextField

export function NewLoadForm({
  organizationId,
  base,
  drivers,
  driversHref,
  trucks,
  trucksHref,
  brokers,
  brokersHref,
  factoringName,
}: {
  organizationId: string
  /** /org/<slug>/loads */
  base: string
  drivers: DriverOption[]
  /** /org/<slug>/drivers */
  driversHref: string
  trucks: TruckOption[]
  /** /org/<slug>/equipment */
  trucksHref: string
  brokers: BrokerOption[]
  /** /org/<slug>/brokers */
  brokersHref: string
  factoringName: string | null
}) {
  const router = useRouter()
  const [driverId, setDriverId] = useState<string | null>(null)
  const [driverPicked, setDriverPicked] = useState(false)
  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    loadSchema,
    async (values) => {
      const result = await createLoad(organizationId, values)
      if ("error" in result) {
        return result.error
      }
      toast.success(`Load ${values.reference} added.`)
      if (result.warning) {
        toast.warning(result.warning)
      }
      router.push(base)
    }
  )

  return (
    <form {...formProps} autoComplete="off">
      <fieldset disabled={pending} className="flex flex-col gap-6">
        <SettingsCard
          title="Load"
          description="From the rate con."
          contentClassName="grid gap-5 sm:grid-cols-6"
        >
          <TextField
            name="reference"
            label="Load number"
            placeholder="e.g. 4471023"
            errors={errors}
            className="sm:col-span-6"
            autoFocus
          />
          <FreightFields errors={errors} onUpdate={revalidate} />
        </SettingsCard>

        <SettingsCard
          title="Broker"
          description="Who booked it, and who sent the rate con."
          contentClassName="grid gap-5 sm:grid-cols-6"
        >
          <BrokerFields
            brokers={brokers}
            brokersHref={brokersHref}
            factoringName={factoringName}
            errors={errors}
            onUpdate={revalidate}
          />
        </SettingsCard>

        <SettingsCard
          title="Stops"
          description="Every pickup and delivery, with its appointment and number."
        >
          <StopsEditor
            defaultStops={[{ kind: "pickup" }, { kind: "delivery" }]}
            errors={errors}
            onUpdate={revalidate}
          />
        </SettingsCard>

        <SettingsCard
          title="Charges"
          description="From the rate con. Accessorials run up on the road are added to the load later."
        >
          <ChargesEditor
            defaultCharges={[{ kind: "linehaul" }, { kind: "fuel_surcharge" }]}
            errors={errors}
            onUpdate={revalidate}
          />
        </SettingsCard>

        <SettingsCard
          title="Assignment"
          description="Truck and driver can stay empty until the load is dispatched."
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
          <Field data-invalid={!!errors.truck_id}>
            <FieldLabel htmlFor="load-truck-id">Truck</FieldLabel>
            <TruckSelect
              id="load-truck-id"
              trucks={trucks}
              invalid={!!errors.truck_id}
              onPick={(truck) => {
                // Prefill the truck's usual driver, unless one was picked by hand.
                if (!driverPicked && truck?.default_driver_id) {
                  setDriverId(truck.default_driver_id)
                }
              }}
              onUpdate={revalidate}
            />
            {errors.truck_id ? (
              <FieldError errors={errors.truck_id} />
            ) : (
              trucks.length === 0 && (
                <FieldDescription>
                  <Link href={trucksHref} className="underline">
                    Add trucks
                  </Link>{" "}
                  to pick them here.
                </FieldDescription>
              )
            )}
          </Field>
          <Field data-invalid={!!errors.driver_id}>
            <FieldLabel htmlFor="load-driver-id">Driver</FieldLabel>
            <DriverSelect
              id="load-driver-id"
              drivers={drivers}
              value={driverId}
              onValueChange={(value) => {
                setDriverId(value)
                setDriverPicked(true)
              }}
              invalid={!!errors.driver_id}
              onUpdate={revalidate}
            />
            {errors.driver_id ? (
              <FieldError errors={errors.driver_id} />
            ) : (
              drivers.length === 0 && (
                <FieldDescription>
                  <Link href={driversHref} className="underline">
                    Add drivers
                  </Link>{" "}
                  to pick them here.
                </FieldDescription>
              )
            )}
          </Field>
          <TextField
            name="miles"
            label="Loaded miles"
            inputMode="numeric"
            placeholder="e.g. 1,240"
            errors={errors}
            onChange={handleMilesInput}
          />
          <TextField
            name="empty_miles"
            label="Empty miles"
            inputMode="numeric"
            placeholder="e.g. 85"
            errors={errors}
            onChange={handleMilesInput}
          />
          <Field data-invalid={!!errors.notes} className="sm:col-span-2">
            <FieldLabel htmlFor="load-notes">Notes</FieldLabel>
            <Textarea
              id="load-notes"
              name="notes"
              rows={3}
              placeholder="Special instructions, gate codes…"
              aria-invalid={!!errors.notes}
            />
            <FieldError errors={errors.notes} />
          </Field>
        </SettingsCard>
      </fieldset>
    </form>
  )
}
