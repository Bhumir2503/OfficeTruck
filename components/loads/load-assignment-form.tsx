"use client"

import { AlertTriangle, CornerDownLeft, Pencil, Truck } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  type AssignmentConflicts,
  checkAssignmentConflicts,
  saveAssignment,
} from "@/app/org/[slug]/loads/actions"
import { DriverSelect } from "@/components/loads/driver-select"
import { LoadPayDialog } from "@/components/loads/load-pay-dialog"
import { EmptyMilesField } from "@/components/loads/empty-miles-field"
import { RouteMilesField } from "@/components/loads/route-miles-field"
import { TruckSelect } from "@/components/loads/truck-select"
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
import { useZodForm } from "@/hooks/use-zod-form"
import { saveLabel, willDispatch } from "@/lib/assignment-format"
import { driverPay, formatPay, loadDriverPay } from "@/lib/driver-format"
import type { DriverOption } from "@/lib/drivers"
import { formatRate } from "@/lib/load-format"
import type { Load } from "@/lib/loads"
import { loadAssignmentSchema } from "@/lib/schemas/load"
import type { TruckOption } from "@/lib/trucks"

const NO_CONFLICTS: AssignmentConflicts = { driver: [], truck: [] }

/** "Ana Torres is also on 8824118 at the same time." */
export function Conflict({
  who,
  loads,
  loadsBase,
}: {
  who: string
  loads: { id: string; reference: string }[]
  loadsBase: string
}) {
  return (
    <p className="flex items-start gap-2 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>
        {who} is also on{" "}
        {loads.map((other, index) => (
          <span key={other.id}>
            {index > 0 && ", "}
            <Link
              href={`${loadsBase}/${other.id}`}
              className="font-medium underline"
            >
              {other.reference}
            </Link>
          </span>
        ))}{" "}
        at the same time.
      </span>
    </p>
  )
}

/**
 * Who's running the load: the truck, driver and miles. Saving a booked load
 * with a truck and driver dispatches it.
 */
export function LoadAssignmentForm({
  organizationId,
  load,
  drivers,
  driversBase,
  trucks,
  trucksBase,
  loadsBase,
  canChangePay,
}: {
  organizationId: string
  load: Load
  drivers: DriverOption[]
  /** /org/<slug>/drivers */
  driversBase: string
  trucks: TruckOption[]
  /** /org/<slug>/equipment */
  trucksBase: string
  /** /org/<slug>/loads */
  loadsBase: string
  /** Owners and admins can set the driver's pay on this load. */
  canChangePay: boolean
}) {
  const [truckId, setTruckId] = useState<string | null>(load.truck_id)
  const [driverId, setDriverId] = useState<string | null>(load.driver_id)
  const [conflicts, setConflicts] = useState(NO_CONFLICTS)
  const [payOpen, setPayOpen] = useState(false)
  // The miles boxes as they read now, to tell whether anything changed.
  const [miles, setMiles] = useState<string | null>(null)
  const [emptyMiles, setEmptyMiles] = useState<string | null>(null)

  const driver = drivers.find((option) => option.id === driverId) ?? null
  const truck = trucks.find((option) => option.id === truckId) ?? null
  const driverChanged = driverId !== load.driver_id
  const sameMiles = (typed: string | null, saved: number | null) =>
    typed === null || typed.replace(/,/g, "") === (saved?.toString() ?? "")
  const changed =
    truckId !== load.truck_id ||
    driverChanged ||
    !sameMiles(miles, load.miles) ||
    !sameMiles(emptyMiles, load.empty_miles)
  const dispatches = willDispatch({
    status: load.status,
    savedDriverId: load.driver_id,
    driverId,
    truckId,
  })

  // Check for clashes as soon as a truck or driver is picked, before saving.
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
      const parts = [`Load ${load.reference} saved.`]
      if (result.removed) parts.push(`${result.removed} is off it.`)
      if (result.dispatched) parts.push(`Dispatched to ${result.dispatched}.`)
      toast.success(parts.join(" "))
    }
  )

  // The pay line: what's locked, or what it will be once saved.
  const savedPay = loadDriverPay(load)
  const savedDriver = drivers.find((option) => option.id === load.driver_id)
  const lockedRate = formatPay(load.driver_pay_type, load.driver_pay_rate)
  let payNote: React.ReactNode
  if (driverChanged) {
    if (!driver) {
      payNote = "No driver, so no driver pay."
    } else {
      const rate = formatPay(driver.pay_type, driver.pay_rate)
      const pay = driverPay(driver, {
        rate: Number(load.rate),
        miles: load.miles,
      })
      payNote = !rate
        ? `${driver.full_name} has no pay rate yet.`
        : pay === null
          ? `Add the miles to work out pay at ${rate}. Locked when you save.`
          : `${formatRate(pay)} at ${rate}, locked when you save.`
    }
  } else if (!load.driver) {
    payNote = "Pick a driver to see their pay."
  } else if (!lockedRate) {
    payNote = `${load.driver.full_name} has no pay rate yet.`
  } else {
    // Different from their usual rate: set for this load (or locked before
    // their rate changed).
    const usualRate = formatPay(
      savedDriver?.pay_type ?? null,
      savedDriver?.pay_rate ?? null
    )
    const own = usualRate !== null && usualRate !== lockedRate
    payNote =
      savedPay === null
        ? `Add the miles to work out pay at ${lockedRate}.`
        : own
          ? `${formatRate(savedPay)}${load.driver_pay_type === "flat" ? "" : ` at ${lockedRate}`} for this load. Usually ${usualRate}.`
          : `${formatRate(savedPay)} at ${lockedRate}, locked when assigned.`
  }
  // Pay can be changed for the driver saved on the load, not one just picked.
  const showChangePay = canChangePay && !!load.driver && !driverChanged

  const truckName = load.truck_link?.unit_number ?? load.truck
  const driverName = load.driver?.full_name ?? load.driver_name
  return (
    <>
      <form {...formProps} autoComplete="off">
        <fieldset disabled={pending}>
          <SettingsCard
            // The load page's next step links here to assign a truck and driver.
            id="assignment"
            className="scroll-mt-6"
            title="Assignment"
            description={
              driverName ? (
                <>
                  {truckName &&
                    (load.truck_link ? (
                      <Link
                        href={`${trucksBase}/${load.truck_link.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {truckName}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">
                        {truckName}
                      </span>
                    ))}
                  {truckName ? ", driven by " : "Driven by "}
                  {load.driver ? (
                    <Link
                      href={`${driversBase}/${load.driver.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {driverName}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">
                      {driverName}
                    </span>
                  )}
                </>
              ) : (
                "No driver assigned"
              )
            }
            contentClassName="flex flex-col gap-5"
            footer={
              <SettingsCardFooter
                hint={
                  formError ? (
                    <span className="text-destructive">{formError}</span>
                  ) : (
                    payNote
                  )
                }
              >
                {showChangePay && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPayOpen(true)}
                  >
                    <Pencil />
                    Change pay
                  </Button>
                )}
                <Button
                  type="submit"
                  size="sm"
                  // Nothing to save, unless saving would dispatch the load.
                  disabled={pending || (!changed && !dispatches)}
                >
                  {pending ? "Saving…" : saveLabel(dispatches)}{" "}
                  {dispatches ? <Truck /> : <CornerDownLeft />}
                </Button>
              </SettingsCardFooter>
            }
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!errors.truck_id}>
                <FieldLabel htmlFor="load-truck-id">Truck</FieldLabel>
                <TruckSelect
                  id="load-truck-id"
                  trucks={trucks}
                  defaultValue={load.truck_id}
                  invalid={!!errors.truck_id}
                  onPick={(picked) => setTruckId(picked?.id ?? null)}
                  onUpdate={revalidate}
                />
                <FieldError errors={errors.truck_id} />
              </Field>
              <Field data-invalid={!!errors.driver_id}>
                <FieldLabel htmlFor="load-driver-id">Driver</FieldLabel>
                <DriverSelect
                  id="load-driver-id"
                  drivers={drivers}
                  value={driverId}
                  onValueChange={setDriverId}
                  invalid={!!errors.driver_id}
                  onUpdate={revalidate}
                />
                {errors.driver_id ? (
                  <FieldError errors={errors.driver_id} />
                ) : (
                  driverChanged &&
                  load.status === "dispatched" && (
                    <FieldDescription>
                      {driver
                        ? `Saving takes ${load.driver?.full_name ?? "the current driver"} off it.`
                        : `Saving takes ${load.driver?.full_name ?? "the driver"} off and puts the load back to booked.`}
                    </FieldDescription>
                  )
                )}
              </Field>
            </div>

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
                    who={truck ? `Truck ${truck.unit_number}` : "This truck"}
                    loads={conflicts.truck}
                    loadsBase={loadsBase}
                  />
                )}
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <RouteMilesField
                // Re-estimated when the stops are saved: show the new number.
                key={`miles-${load.miles}`}
                organizationId={organizationId}
                defaultValue={load.miles}
                errors={errors.miles}
                onValueChange={setMiles}
              />
              <EmptyMilesField
                // Re-estimated when the stops are saved: show the new number.
                key={`empty-${load.empty_miles}`}
                organizationId={organizationId}
                truckId={truckId}
                loadId={load.id}
                defaultValue={load.empty_miles}
                errors={errors.empty_miles}
                onValueChange={setEmptyMiles}
                trucksBase={trucksBase}
              />
            </div>
          </SettingsCard>
        </fieldset>
      </form>
      {/* Outside the assignment form: a form can't sit inside another. */}
      {showChangePay && (
        <LoadPayDialog
          organizationId={organizationId}
          load={load}
          usual={{
            pay_type: savedDriver?.pay_type ?? null,
            pay_rate: savedDriver?.pay_rate ?? null,
          }}
          open={payOpen}
          onOpenChange={setPayOpen}
        />
      )}
    </>
  )
}
