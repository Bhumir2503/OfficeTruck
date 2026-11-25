"use client"

import { Truck } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  type AssignmentConflicts,
  checkAssignmentConflicts,
  saveAssignment,
} from "@/app/org/[slug]/loads/actions"
import { DriverSelect } from "@/components/loads/driver-select"
import { EmptyMilesField } from "@/components/loads/empty-miles-field"
import { Conflict } from "@/components/loads/load-assignment-form"
import { TruckSelect } from "@/components/loads/truck-select"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { useZodForm } from "@/hooks/use-zod-form"
import { saveLabel, willDispatch } from "@/lib/assignment-format"
import { driverPay, formatPay } from "@/lib/driver-format"
import type { DriverOption } from "@/lib/drivers"
import { formatRate } from "@/lib/load-format"
import type { Load } from "@/lib/loads"
import { loadAssignmentSchema } from "@/lib/schemas/load"
import type { TruckOption } from "@/lib/trucks"

const NO_CONFLICTS: AssignmentConflicts = { driver: [], truck: [] }

// Lives inside the dialog content, so it starts fresh each time it opens.
function AssignForm({
  organizationId,
  load,
  trucks,
  drivers,
  trucksBase,
  driversBase,
  loadsBase,
  onDone,
}: {
  organizationId: string
  load: Load
  trucks: TruckOption[]
  drivers: DriverOption[]
  trucksBase: string
  driversBase: string
  loadsBase: string
  onDone: () => void
}) {
  const [truckId, setTruckId] = useState<string | null>(load.truck_id)
  const [driverId, setDriverId] = useState<string | null>(load.driver_id)
  // Picked by hand: the truck's usual driver doesn't replace them.
  const [driverPicked, setDriverPicked] = useState(!!load.driver_id)
  const [conflicts, setConflicts] = useState(NO_CONFLICTS)

  const driver = drivers.find((option) => option.id === driverId) ?? null
  const dispatches = willDispatch({
    status: load.status,
    savedDriverId: load.driver_id,
    driverId,
    truckId,
  })

  // Clashes with the driver's or truck's other loads, before saving.
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      checkAssignmentConflicts(organizationId, load.id, truckId, driverId)
        .then((found) => !cancelled && setConflicts(found))
        .catch(() => !cancelled && setConflicts(NO_CONFLICTS))
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [organizationId, load.id, truckId, driverId])

  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    loadAssignmentSchema,
    async (values) => {
      const result = await saveAssignment(organizationId, load.id, values)
      if ("error" in result) {
        return result.error
      }
      const parts = [`Load ${load.reference} assigned.`]
      if (result.dispatched) parts.push(`Dispatched to ${result.dispatched}.`)
      toast.success(parts.join(" "))
      onDone()
    }
  )

  // What the driver will be paid for this load, locked when saved.
  let payNote: string | null = null
  if (driver) {
    const rate = formatPay(driver.pay_type, driver.pay_rate)
    const pay = driverPay(driver, {
      rate: Number(load.rate),
      miles: load.miles,
    })
    payNote = !rate
      ? `${driver.full_name} has no pay rate yet.`
      : pay === null
        ? `Paid ${rate}. Add the miles to work out the pay.`
        : `${formatRate(pay)} at ${rate}, locked when you save.`
  }

  return (
    <form {...formProps} autoComplete="off">
      <fieldset disabled={pending} className="flex flex-col gap-5">
        {/* Loaded miles stay as they are; empty miles depend on the truck. */}
        <input type="hidden" name="miles" value={load.miles ?? ""} />
        <Field data-invalid={!!errors.truck_id}>
          <FieldLabel htmlFor="assign-truck-id">Truck</FieldLabel>
          <TruckSelect
            id="assign-truck-id"
            trucks={trucks}
            defaultValue={load.truck_id}
            invalid={!!errors.truck_id}
            onPick={(truck) => {
              setTruckId(truck?.id ?? null)
              // The truck's usual driver, unless one was picked by hand.
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
                <Link href={trucksBase} className="underline">
                  Add trucks
                </Link>{" "}
                to pick them here.
              </FieldDescription>
            )
          )}
        </Field>
        <Field data-invalid={!!errors.driver_id}>
          <FieldLabel htmlFor="assign-driver-id">Driver</FieldLabel>
          <DriverSelect
            id="assign-driver-id"
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
          ) : drivers.length === 0 ? (
            <FieldDescription>
              <Link href={driversBase} className="underline">
                Add drivers
              </Link>{" "}
              to pick them here.
            </FieldDescription>
          ) : (
            payNote && <FieldDescription>{payNote}</FieldDescription>
          )}
        </Field>

        <EmptyMilesField
          id="assign-empty-miles"
          organizationId={organizationId}
          truckId={truckId}
          loadId={load.id}
          defaultValue={load.empty_miles}
          errors={errors.empty_miles}
          trucksBase={trucksBase}
        />

        {(conflicts.driver.length > 0 || conflicts.truck.length > 0) && (
          <div
            role="alert"
            className="flex flex-col gap-1.5 rounded-lg bg-amber-500/15 px-3 py-2 text-amber-800 dark:text-amber-200"
          >
            {conflicts.driver.length > 0 && (
              <Conflict
                who={driver?.full_name ?? "This driver"}
                loads={conflicts.driver}
                loadsBase={loadsBase}
              />
            )}
            {conflicts.truck.length > 0 && (
              <Conflict
                who={
                  trucks.find((truck) => truck.id === truckId)
                    ? `Truck ${trucks.find((truck) => truck.id === truckId)!.unit_number}`
                    : "This truck"
                }
                loads={conflicts.truck}
                loadsBase={loadsBase}
              />
            )}
          </div>
        )}

        {dispatches && driver && (
          <p className="text-sm text-muted-foreground">
            Saving dispatches the load to {driver.full_name}.
          </p>
        )}

        <DialogFooter className="items-center">
          {formError && (
            <p className="mr-auto text-sm text-destructive">{formError}</p>
          )}
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : saveLabel(dispatches)}
            {dispatches && <Truck />}
          </Button>
        </DialogFooter>
      </fieldset>
    </form>
  )
}

/** The next step's popup for picking the truck and driver that run a load. */
export function AssignDialog({
  open,
  onOpenChange,
  ...props
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  load: Load
  trucks: TruckOption[]
  drivers: DriverOption[]
  trucksBase: string
  driversBase: string
  loadsBase: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign load {props.load.reference}</DialogTitle>
          <DialogDescription>
            Pick the truck and the driver running it.
          </DialogDescription>
        </DialogHeader>
        <AssignForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
