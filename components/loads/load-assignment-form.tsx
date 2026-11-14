"use client"

import { AlertTriangle, Copy, CornerDownLeft, Send } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  type AssignmentConflicts,
  checkAssignmentConflicts,
  saveAssignment,
  sendToDriver,
} from "@/app/org/[slug]/loads/actions"
import {
  DriverSelect,
  formatMiles,
  handleMilesInput,
} from "@/components/loads/driver-select"
import { LocalTime } from "@/components/loads/local-time"
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
import { Input } from "@/components/ui/input"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  offerResend,
  RESEND_AFTER_MS,
  saveLabel,
  willNotify,
} from "@/lib/assignment-format"
import type { LoadDispatch } from "@/lib/dispatch"
import { driverPay, formatPay, loadDriverPay } from "@/lib/driver-format"
import type { DriverOption } from "@/lib/drivers"
import { formatRate } from "@/lib/load-format"
import type { Load } from "@/lib/loads"
import { loadAssignmentSchema } from "@/lib/schemas/load"
import type { TruckOption } from "@/lib/trucks"

const NO_CONFLICTS: AssignmentConflicts = { driver: [], truck: [] }

function MilesField({
  name,
  label,
  value,
  errors,
}: {
  name: "miles" | "empty_miles"
  label: string
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
      <FieldError errors={errors} />
    </Field>
  )
}

/** "Ana Torres is also on 8824118 at the same time." */
function Conflict({
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
 * Who's running the load: the truck, driver and miles, and whether the
 * driver has been notified. Saving notifies a new driver and tells one taken
 * off; nothing is sent until Save.
 */
export function LoadAssignmentForm({
  organizationId,
  load,
  drivers,
  driversBase,
  trucks,
  trucksBase,
  loadsBase,
  dispatch,
  link,
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
  /** The driver's live link, once they've been notified. */
  dispatch: LoadDispatch | null
  link: string | null
}) {
  const [truckId, setTruckId] = useState<string | null>(load.truck_id)
  const [driverId, setDriverId] = useState<string | null>(load.driver_id)
  const [conflicts, setConflicts] = useState(NO_CONFLICTS)
  const [busy, setBusy] = useState<"resend" | null>(null)
  // The clock, for when Resend shows; set after mount so the server and
  // browser render the same thing.
  const [now, setNow] = useState<number | null>(null)

  const driver = drivers.find((option) => option.id === driverId) ?? null
  const truck = trucks.find((option) => option.id === truckId) ?? null
  const driverChanged = driverId !== load.driver_id
  const notify = willNotify({
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

  // Read the clock after mount, and again when the 20 minutes are up.
  useEffect(() => {
    const timers = [setTimeout(() => setNow(Date.now()), 0)]
    if (dispatch && !dispatch.seen_at) {
      const due =
        new Date(dispatch.sent_at).getTime() + RESEND_AFTER_MS - Date.now()
      if (due > 0) {
        timers.push(setTimeout(() => setNow(Date.now()), due + 1000))
      }
    }
    return () => timers.forEach(clearTimeout)
  }, [dispatch])

  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    loadAssignmentSchema,
    async (values) => {
      const result = await saveAssignment(organizationId, load.id, values)
      if ("error" in result) {
        return result.error
      }
      const parts = [`Load ${load.reference} saved.`]
      if (result.removed)
        parts.push(`${result.removed} was told it's off their schedule.`)
      if (result.notified) parts.push(`${result.notified} was notified.`)
      toast.success(parts.join(" "))
      for (const problem of result.problems) {
        toast.warning(problem)
      }
    }
  )

  async function resend() {
    setBusy("resend")
    const result = await sendToDriver(organizationId, load.id)
    setBusy(null)
    if ("error" in result) {
      toast.error(result.error)
    } else if (result.emailError) {
      toast.warning(result.emailError)
    } else {
      toast.success(`Sent to ${load.driver?.full_name ?? "the driver"} again.`)
    }
  }

  async function copyLink() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      toast.success("Link copied. Text it to the driver.")
    } catch {
      toast.error("Couldn't copy the link.")
    }
  }

  // The pay line: what's locked, or what it will be once saved.
  const savedPay = loadDriverPay(load)
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
    payNote =
      savedPay === null
        ? `Add the miles to work out pay at ${lockedRate}.`
        : `${formatRate(savedPay)} at ${lockedRate}, locked when assigned.`
  }

  const truckName = load.truck_link?.unit_number ?? load.truck
  const driverName = load.driver?.full_name ?? load.driver_name
  const showResend =
    !!dispatch &&
    now !== null &&
    offerResend({
      sentAt: dispatch.sent_at,
      seenAt: dispatch.seen_at,
      emailTo: dispatch.email_to,
      emailFailed: dispatch.email_failed,
      now,
    })

  return (
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
              <Button type="submit" size="sm" disabled={pending}>
                {pending
                  ? "Saving…"
                  : saveLabel(notify, driver?.full_name ?? null)}{" "}
                {notify ? <Send /> : <CornerDownLeft />}
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
                      ? `${load.driver?.full_name ?? "The current driver"} will be told it's off their schedule.`
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
            <MilesField
              name="miles"
              label="Loaded miles"
              value={load.miles}
              errors={errors.miles}
            />
            <MilesField
              name="empty_miles"
              label="Empty miles"
              value={load.empty_miles}
              errors={errors.empty_miles}
            />
          </div>

          {load.driver && dispatch && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-sm">
              <p className="text-muted-foreground">
                Notified <LocalTime value={dispatch.sent_at} />
                {" · "}
                {dispatch.seen_at ? (
                  <>
                    Opened <LocalTime value={dispatch.seen_at} />
                  </>
                ) : (
                  "Not opened yet"
                )}
              </p>
              {showResend && (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={busy !== null || pending}
                    onClick={() => void resend()}
                  >
                    <Send />
                    {busy === "resend" ? "Sending…" : "Resend"}
                  </Button>
                  {link && (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void copyLink()}
                    >
                      <Copy />
                      Copy driver link
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </SettingsCard>
      </fieldset>
    </form>
  )
}
