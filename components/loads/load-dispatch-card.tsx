"use client"

import {
  AlertTriangle,
  Check,
  CheckCheck,
  Copy,
  CornerDownLeft,
  Send,
  UserMinus,
} from "lucide-react"
import { cn } from "cn"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import {
  sendToDriver,
  unassignLoad,
  updateLoadAssignment,
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
import type { LoadDispatch } from "@/lib/dispatch"
import { formatPay, loadDriverPay } from "@/lib/driver-format"
import type { DriverOption } from "@/lib/drivers"
import { formatRate, STATUS_STYLES } from "@/lib/load-format"
import type { Load } from "@/lib/loads"
import { loadAssignmentSchema } from "@/lib/schemas/load"
import type { TruckOption } from "@/lib/trucks"

/** Seen and accepted, as small checkmarks rather than a status. */
function Receipt({ dispatch }: { dispatch: LoadDispatch }) {
  if (dispatch.accepted_at) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
        <CheckCheck className="size-4" />
        Accepted <LocalTime value={dispatch.accepted_at} />
      </span>
    )
  }
  if (dispatch.seen_at) {
    return (
      <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300">
        <Check className="size-4" />
        Seen <LocalTime value={dispatch.seen_at} />
      </span>
    )
  }
  return <span className="text-muted-foreground">Not opened yet</span>
}

/** One line of the dispatch summary: a label on the left, the value beside it. */
function SummaryRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium">{children}</dd>
    </div>
  )
}

/** The driver's pay on this load, or why there's no figure yet. */
function payDetail(load: Load): { value: string | null; note: string } {
  if (!load.driver) {
    return {
      value: null,
      note: load.driver_name
        ? `Typed in as "${load.driver_name}". Pick the driver to link the load to them.`
        : "Pick a driver to see their pay.",
    }
  }
  const locked = formatPay(load.driver_pay_type, load.driver_pay_rate)
  if (!locked) {
    return {
      value: null,
      note: `${load.driver.full_name} has no pay rate yet. It's filled in when you save once they have one.`,
    }
  }
  const pay = loadDriverPay(load)
  // The rate on the load stays as it was when the driver was assigned.
  const current = formatPay(load.driver.pay_type, load.driver.pay_rate)
  const note =
    pay === null
      ? `Add the miles to work out pay at ${locked}.`
      : current && current !== locked
        ? `At ${locked}, locked when assigned. Their rate is now ${current}.`
        : `At ${locked}, locked when assigned.`
  return { value: pay === null ? null : formatRate(pay), note }
}

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

/**
 * Who's running the load and how far, and sending it to them: the truck,
 * driver and miles, then the dispatch and what's happened since (the driver
 * opening and accepting it, sending it again, or taking it back).
 *
 * Remount it (with a key) when the truck or driver changes elsewhere, so the
 * pickers don't keep the old ones.
 */
export function LoadDispatchCard({
  organizationId,
  load,
  drivers,
  driversBase,
  trucks,
  trucksBase,
  dispatch,
  link,
  shareRate,
  overlaps,
  driverEmail,
  loadsBase,
  settingsHref,
}: {
  organizationId: string
  load: Load
  drivers: DriverOption[]
  /** /org/<slug>/drivers */
  driversBase: string
  trucks: TruckOption[]
  /** /org/<slug>/equipment */
  trucksBase: string
  dispatch: LoadDispatch | null
  /** The live dispatch's private link. */
  link: string | null
  /** Whether the company sends the rate to drivers. */
  shareRate: boolean
  /** The driver's other loads at the same time. */
  overlaps: { id: string; reference: string }[]
  driverEmail: string | null
  /** /org/<slug>/loads */
  loadsBase: string
  /** /org/<slug>/settings */
  settingsHref: string
}) {
  const [pending, setPending] = useState<"send" | "unassign" | null>(null)
  const [confirming, setConfirming] = useState(false)
  // Unsaved changes to the truck, driver or miles. Sending uses what's saved,
  // so it waits until they're saved. Worked out by comparing the form with
  // the load, since the pickers also report updates when they mount.
  const [dirty, setDirty] = useState(false)
  function checkDirty(formElement: HTMLFormElement | null) {
    if (!formElement) return
    const data = new FormData(formElement)
    const miles = (name: string) =>
      String(data.get(name) ?? "").replace(/[,\s]/g, "")
    setDirty(
      String(data.get("truck_id") ?? "") !== (load.truck_id ?? "") ||
        String(data.get("driver_id") ?? "") !== (load.driver_id ?? "") ||
        miles("miles") !== (load.miles === null ? "" : String(load.miles)) ||
        miles("empty_miles") !==
          (load.empty_miles === null ? "" : String(load.empty_miles))
    )
  }

  const { errors, formError, formProps, revalidate, ...form } = useZodForm(
    loadAssignmentSchema,
    async (values) => {
      const result = await updateLoadAssignment(organizationId, load.id, values)
      if ("error" in result) {
        return result.error
      }
      setDirty(false)
      toast.success(`Load ${load.reference} saved.`)
      if (result.warning) {
        toast.warning(result.warning)
      }
    }
  )
  const saving = form.pending
  const busy = saving || !!pending

  const driverName = load.driver?.full_name ?? null
  const firstName = driverName?.split(" ")[0]
  const assigned = !!load.driver && !!load.truck_link
  const booked = load.status === "booked"
  const dispatched = load.status === "dispatched"
  // Past dispatch (or canceled), only what the driver saw is reported.
  const canSend = booked || dispatched

  async function send() {
    setPending("send")
    const result = await sendToDriver(organizationId, load.id)
    setPending(null)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    const verb = result.resent ? "sent again" : "sent"
    if (result.emailError) {
      toast.warning(
        `Load ${load.reference} ${verb} to ${driverName}. ${result.emailError}`
      )
    } else {
      toast.success(`Load ${load.reference} ${verb} to ${driverName}.`)
    }
    if (result.warning) {
      toast.warning(result.warning)
    }
  }

  async function unassign() {
    setPending("unassign")
    const result = await unassignLoad(organizationId, load.id)
    setPending(null)
    setConfirming(false)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success(
      `${driverName ?? "The driver"} was taken off load ${load.reference}. It's back to booked.`
    )
    if (result.emailError) {
      toast.warning(result.emailError)
    }
  }

  async function copyLink() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      toast.success(
        "Link copied. Text it to the driver if they didn't get the email."
      )
    } catch {
      toast.error("Couldn't copy the link.")
    }
  }

  const description = !canSend
    ? "Who ran this load, and how far."
    : dispatched
      ? `${driverName ?? "The driver"} has the load. Send it again if the stops or numbers change.`
      : assigned
        ? `Send ${driverName} the stops, appointments, pickup numbers and rate con.`
        : "Pick a truck and driver, save, then send the load to them."

  const hint = formError ? (
    <span className="text-destructive">{formError}</span>
  ) : dirty && canSend ? (
    "Save your changes before sending."
  ) : dispatched ? (
    "Unassigning sends the load back to booked and tells the driver."
  ) : booked ? (
    "The load stays booked until it's sent."
  ) : null

  const pay = payDetail(load)

  // A load can be dispatched with no send on record if it was set before
  // sending existed.
  const sentLabel =
    dispatch && !booked
      ? dispatched
        ? "Sent"
        : "Sent earlier"
      : dispatched
        ? "Dispatched"
        : "Not sent"

  return (
    <form
      {...formProps}
      onChange={(event) => {
        formProps.onChange(event)
        checkDirty(event.currentTarget)
      }}
      autoComplete="off"
    >
      <fieldset disabled={saving}>
        <SettingsCard
          id="assignment"
          className="scroll-mt-6"
          title="Truck, driver and dispatch"
          description={description}
          contentClassName="flex flex-col gap-5"
          footer={
            <SettingsCardFooter hint={hint}>
              {dispatched &&
                (confirming ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setConfirming(false)}
                    >
                      Keep
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={busy}
                      onClick={unassign}
                    >
                      <UserMinus />
                      {pending === "unassign"
                        ? "Unassigning…"
                        : `Take ${firstName ?? "them"} off`}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setConfirming(true)}
                  >
                    <UserMinus />
                    Unassign
                  </Button>
                ))}
              {canSend && !confirming && (
                <Button
                  type="button"
                  variant={dispatched ? "outline" : "default"}
                  size="sm"
                  disabled={!assigned || dirty || busy}
                  onClick={send}
                >
                  <Send />
                  {pending === "send"
                    ? "Sending…"
                    : dispatched
                      ? "Send again"
                      : assigned
                        ? `Send to ${firstName}`
                        : "Send to driver"}
                </Button>
              )}
              {!confirming && (
                <Button
                  type="submit"
                  size="sm"
                  variant={canSend && !dirty ? "outline" : "default"}
                  disabled={busy}
                >
                  {saving ? "Saving…" : "Save"} <CornerDownLeft />
                </Button>
              )}
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
                onUpdate={(formElement) => {
                  revalidate(formElement)
                  checkDirty(formElement)
                }}
              />
              {errors.truck_id ? (
                <FieldError errors={errors.truck_id} />
              ) : load.truck_link ? (
                <FieldDescription>
                  <Link
                    href={`${trucksBase}/${load.truck_link.id}`}
                    className="underline"
                  >
                    View {load.truck_link.unit_number}
                  </Link>
                </FieldDescription>
              ) : (
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
                onUpdate={(formElement) => {
                  revalidate(formElement)
                  checkDirty(formElement)
                }}
              />
              {errors.driver_id ? (
                <FieldError errors={errors.driver_id} />
              ) : dispatched ? (
                <FieldDescription>
                  Unassign first to change the driver.
                </FieldDescription>
              ) : (
                load.driver && (
                  <FieldDescription>
                    <Link
                      href={`${driversBase}/${load.driver.id}`}
                      className="underline"
                    >
                      View {load.driver.full_name}
                    </Link>
                  </FieldDescription>
                )
              )}
            </Field>
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

          <aside className="flex flex-col gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">Dispatch</span>
              <span
                className={cn(
                  "inline-flex h-6 items-center rounded-4xl px-2.5 text-xs font-medium",
                  dispatched
                    ? STATUS_STYLES.dispatched
                    : "bg-muted text-muted-foreground"
                )}
              >
                {sentLabel}
              </span>
            </div>
            <dl className="flex flex-col gap-2.5">
              {dispatch && !booked && (
                <>
                  <SummaryRow label="Sent">
                    <LocalTime value={dispatch.sent_at} />
                    {dispatch.email_to && (
                      <span className="block font-normal break-all text-muted-foreground">
                        {dispatch.email_to}
                      </span>
                    )}
                  </SummaryRow>
                  <SummaryRow label="Driver">
                    <Receipt dispatch={dispatch} />
                  </SummaryRow>
                </>
              )}
              <SummaryRow label="Driver pay">
                {pay.value}
                <span className="block font-normal text-muted-foreground">
                  {pay.note}
                </span>
              </SummaryRow>
              {canSend && (
                <SummaryRow label="Rate">
                  <span className="font-normal">
                    {shareRate ? "Sent to the driver" : "Kept from the driver"}{" "}
                    ·{" "}
                    <Link href={settingsHref} className="underline">
                      Change
                    </Link>
                  </span>
                </SummaryRow>
              )}
            </dl>
            {assigned && booked && !driverEmail && (
              <p className="text-muted-foreground">
                {driverName} has no email address, so you&apos;ll get a link to
                send them yourself.
              </p>
            )}
            {overlaps.length > 0 && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md bg-amber-500/15 px-3 py-2 text-amber-800 dark:text-amber-200"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {driverName} is also on{" "}
                  {overlaps.map((other, index) => (
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
              </div>
            )}
            {dispatched && link && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={copyLink}
              >
                <Copy />
                Copy driver link
              </Button>
            )}
          </aside>
        </SettingsCard>
      </fieldset>
    </form>
  )
}
