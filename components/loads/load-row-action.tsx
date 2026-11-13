"use client"

import {
  Clock,
  MapPin,
  PackageCheck,
  Send,
  Truck,
  UserPlus,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import {
  sendToDriver,
  updateLoadAssignment,
  updateLoadStatus,
} from "@/app/org/[slug]/loads/actions"
import { DriverSelect } from "@/components/loads/driver-select"
import { TruckSelect } from "@/components/loads/truck-select"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { useZodForm } from "@/hooks/use-zod-form"
import type { DriverOption } from "@/lib/drivers"
import { formatStopDate, formatStopWindow } from "@/lib/load-format"
import { LOAD_VIEW_LABELS, viewOf, type PaymentDue } from "@/lib/load-views"
import type { Load } from "@/lib/loads"
import { loadAssignmentSchema } from "@/lib/schemas/load"
import type { TruckOption } from "@/lib/trucks"

export type RowActionContext = {
  organizationId: string
  drivers: DriverOption[]
  trucks: TruckOption[]
  /** Whether the company sends the rate to drivers. */
  shareRate: boolean
  /** /org/<slug> */
  orgBase: string
}

type Action = "assign" | "send" | "loaded" | "delivered"

/** The first pickup to the last delivery, as a line in a dialog. */
function Route({ load }: { load: Load }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 size-4 shrink-0 text-sky-600" />
        <div className="min-w-0">
          <p className="truncate font-medium">{load.pickup_location}</p>
          <p className="text-muted-foreground">
            {formatStopWindow(load.pickup_start, load.pickup_end)}
          </p>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <PackageCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        <div className="min-w-0">
          <p className="truncate font-medium">{load.delivery_location}</p>
          <p className="text-muted-foreground">
            {formatStopWindow(load.delivery_start, load.delivery_end)}
          </p>
        </div>
      </div>
    </div>
  )
}

function AssignForm({
  load,
  context,
  onDone,
}: {
  load: Load
  context: RowActionContext
  onDone: () => void
}) {
  const [driverId, setDriverId] = useState<string | null>(load.driver_id)
  const [driverPicked, setDriverPicked] = useState(!!load.driver_id)
  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    loadAssignmentSchema,
    async (values) => {
      if (!values.truck_id || !values.driver_id) {
        return "Pick a truck and a driver, so the load can be sent."
      }
      const result = await updateLoadAssignment(
        context.organizationId,
        load.id,
        values
      )
      if ("error" in result) {
        return result.error
      }
      const driver = context.drivers.find((d) => d.id === values.driver_id)
      toast.success(
        `${driver?.full_name ?? "The driver"} is on load ${load.reference}. Send it when you're ready.`
      )
      if (result.warning) {
        toast.warning(result.warning)
      }
      onDone()
    }
  )

  return (
    <form {...formProps} autoComplete="off" className="grid gap-6">
      {/* Keep the miles as they are; this only sets who runs it. */}
      <input type="hidden" name="miles" value={load.miles ?? ""} />
      <input type="hidden" name="empty_miles" value={load.empty_miles ?? ""} />
      <fieldset disabled={pending} className="grid gap-4">
        <Route load={load} />
        <Field data-invalid={!!errors.truck_id}>
          <FieldLabel htmlFor={`assign-truck-${load.id}`}>Truck</FieldLabel>
          <TruckSelect
            id={`assign-truck-${load.id}`}
            trucks={context.trucks}
            defaultValue={load.truck_id}
            invalid={!!errors.truck_id}
            onPick={(truck) => {
              // Prefill the truck's usual driver, unless one was picked by hand.
              if (!driverPicked && truck?.default_driver_id) {
                setDriverId(truck.default_driver_id)
              }
            }}
            onUpdate={revalidate}
          />
          <FieldError errors={errors.truck_id} />
        </Field>
        <Field data-invalid={!!errors.driver_id}>
          <FieldLabel htmlFor={`assign-driver-${load.id}`}>Driver</FieldLabel>
          <DriverSelect
            id={`assign-driver-${load.id}`}
            drivers={context.drivers}
            value={driverId}
            onValueChange={(value) => {
              setDriverId(value)
              setDriverPicked(true)
            }}
            invalid={!!errors.driver_id}
            onUpdate={revalidate}
          />
          <FieldError errors={errors.driver_id} />
        </Field>
        {(context.trucks.length === 0 || context.drivers.length === 0) && (
          <p className="text-muted-foreground">
            Add{" "}
            {context.trucks.length === 0 && (
              <Link href={`${context.orgBase}/equipment`} className="underline">
                trucks
              </Link>
            )}
            {context.trucks.length === 0 &&
              context.drivers.length === 0 &&
              " and "}
            {context.drivers.length === 0 && (
              <Link href={`${context.orgBase}/drivers`} className="underline">
                drivers
              </Link>
            )}{" "}
            to pick them here.
          </p>
        )}
        {formError && <p className="text-destructive">{formError}</p>}
      </fieldset>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={pending}>
          <UserPlus />
          {pending ? "Assigning…" : "Assign"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function SendForm({
  load,
  context,
  onDone,
}: {
  load: Load
  context: RowActionContext
  onDone: () => void
}) {
  const [pending, setPending] = useState(false)
  const driver = context.drivers.find((d) => d.id === load.driver_id)
  const name = driver?.full_name ?? load.driver?.full_name ?? "the driver"

  async function send() {
    setPending(true)
    const result = await sendToDriver(context.organizationId, load.id)
    setPending(false)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    if (result.emailError) {
      toast.warning(
        `Load ${load.reference} sent to ${name}. ${result.emailError} Copy the link from the load page to text it to them.`
      )
    } else {
      toast.success(`Load ${load.reference} sent to ${name}.`)
    }
    if (result.warning) {
      toast.warning(result.warning)
    }
    onDone()
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <Route load={load} />
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-muted-foreground">Driver</dt>
            <dd className="font-medium">{name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Truck</dt>
            <dd className="font-medium">
              {load.truck_link?.unit_number ?? "—"}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Emailed to</dt>
            <dd className="font-medium">
              {driver?.email ?? (
                <span className="font-normal text-muted-foreground">
                  No email on file. You&apos;ll copy the link from the load page
                  and text it.
                </span>
              )}
            </dd>
          </div>
        </dl>
        <p className="text-muted-foreground">
          Sends the stops, appointments, pickup numbers and rate con.{" "}
          {context.shareRate
            ? "Includes the rate."
            : "The rate isn't included."}{" "}
          The load moves to dispatched.
        </p>
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button disabled={pending} onClick={send}>
          <Send />
          {pending ? "Sending…" : `Send to ${name.split(" ")[0]}`}
        </Button>
      </DialogFooter>
    </div>
  )
}

function StatusForm({
  load,
  status,
  context,
  onDone,
}: {
  load: Load
  status: "loaded" | "delivered"
  context: RowActionContext
  onDone: () => void
}) {
  const [pending, setPending] = useState(false)
  const label = status === "loaded" ? "Mark loaded" : "Mark delivered"

  async function save() {
    setPending(true)
    const result = await updateLoadStatus(
      context.organizationId,
      load.id,
      status
    )
    setPending(false)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success(
      `Load ${load.reference} is ${status === "loaded" ? "loaded" : "delivered"}.`
    )
    onDone()
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <Route load={load} />
        <p className="text-muted-foreground">
          {load.driver?.full_name ?? "The driver"}
          {load.truck_link ? ` in ${load.truck_link.unit_number}` : ""}{" "}
          {status === "loaded"
            ? "picked up the freight."
            : "dropped off the freight. It moves to Needs billing."}
        </p>
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button disabled={pending} onClick={save}>
          {status === "loaded" ? <Truck /> : <PackageCheck />}
          {pending ? "Saving…" : label}
        </Button>
      </DialogFooter>
    </div>
  )
}

const TITLES: Record<Action, (load: Load) => string> = {
  assign: (load) => `Assign load ${load.reference}`,
  send: (load) => `Send load ${load.reference}`,
  loaded: (load) => `Mark ${load.reference} loaded`,
  delivered: (load) => `Mark ${load.reference} delivered`,
}

const DESCRIPTIONS: Record<Action, string> = {
  assign: "Pick who runs it. It stays booked until you send it.",
  send: "Your driver gets a private link to the load.",
  loaded: "Once the freight is on the truck.",
  delivered: "Once the freight is dropped off.",
}

/** Which action a load's row offers, if any we can do from the table. */
function actionFor(load: Load): Action | null {
  switch (viewOf(load)) {
    case "needs_driver":
      return "assign"
    case "ready_to_send":
      return "send"
    case "on_the_road":
      return load.status === "dispatched" ? "loaded" : "delivered"
    default:
      return null
  }
}

/**
 * The next step for a load, as a button that opens what it needs. Billing
 * and payments aren't set up yet, so those rows just say where they stand.
 */
export function LoadRowAction({
  load,
  due,
  context,
}: {
  load: Load
  due?: PaymentDue
  context: RowActionContext
}) {
  const [open, setOpen] = useState(false)
  const action = actionFor(load)

  if (!action) {
    const view = viewOf(load)
    if (view === "waiting_on_pay" && due) {
      return due.days_late > 0 ? (
        <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-destructive">
          <Clock className="size-3.5" />
          Overdue {due.days_late} {due.days_late === 1 ? "day" : "days"}
        </span>
      ) : (
        <span className="whitespace-nowrap text-muted-foreground">
          Due {formatStopDate(`${due.due_on}T00:00:00`)}
        </span>
      )
    }
    return (
      <span className="whitespace-nowrap text-muted-foreground">
        {view ? LOAD_VIEW_LABELS[view] : "—"}
      </span>
    )
  }

  const button = {
    assign: { icon: <UserPlus />, label: "Assign driver" },
    send: {
      icon: <Send />,
      label: `Send to ${load.driver?.full_name.split(" ")[0] ?? "driver"}`,
    },
    loaded: { icon: <Truck />, label: "Mark loaded" },
    delivered: { icon: <PackageCheck />, label: "Mark delivered" },
  }[action]

  const close = () => setOpen(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant={action === "send" ? "default" : "outline"}
        size="sm"
        className="whitespace-nowrap"
        onClick={() => setOpen(true)}
      >
        {button.icon}
        {button.label}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TITLES[action](load)}</DialogTitle>
          <DialogDescription>{DESCRIPTIONS[action]}</DialogDescription>
        </DialogHeader>
        {action === "assign" && (
          <AssignForm load={load} context={context} onDone={close} />
        )}
        {action === "send" && (
          <SendForm load={load} context={context} onDone={close} />
        )}
        {(action === "loaded" || action === "delivered") && (
          <StatusForm
            load={load}
            status={action}
            context={context}
            onDone={close}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
