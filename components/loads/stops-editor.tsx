"use client"

import { cn } from "cn"
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  MapPin,
  PackageCheck,
  Trash2,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { AddressInput } from "@/components/loads/address-input"
import { DateTimeField } from "@/components/loads/date-time-field"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  APPOINTMENT_TYPE_LABELS,
  APPOINTMENT_TYPES,
  type AppointmentType,
  STOP_KINDS,
  STOP_KIND_LABELS,
  type StopKind,
} from "@/lib/schemas/load"

type Errors = Partial<Record<string, { message: string }[]>>

/** A stop as it's saved, to start the editor from. */
export type StopDefaults = {
  id?: string
  kind: StopKind
  facility?: string | null
  location?: string
  appointment_type?: AppointmentType
  appointment_start?: string
  appointment_end?: string | null
  stop_number?: string | null
  reference_numbers?: string | null
  contact_phone?: string | null
  notes?: string | null
  /** The driver has checked in here, so it can't be removed. */
  locked?: boolean
}

type Row = StopDefaults & {
  key: number
  appointment_type: AppointmentType
  /** The PO numbers, phone and notes are showing. */
  open: boolean
}

const hasMore = (stop: StopDefaults) =>
  !!(stop.reference_numbers || stop.contact_phone || stop.notes)

const toRow = (stop: StopDefaults, key: number): Row => ({
  ...stop,
  key,
  appointment_type:
    stop.appointment_type ?? (stop.appointment_end ? "window" : "appointment"),
  open: hasMore(stop),
})

const TYPE_HINTS: Record<AppointmentType, string> = {
  appointment: "A set appointment time, local to the stop.",
  window: "Any time between these, like first come, first served (FCFS).",
  tbd: "To be scheduled: just the date for now. Set the time once it's booked.",
}

/**
 * Pickups and deliveries in the order they're run. Fills inputs named
 * "stops.0.kind", "stops.0.location"… for the form around it. Stops can be
 * added, moved and removed; inputs keep what was typed as they move, since
 * each row keeps its key.
 *
 * `onStopsChange` runs when stops are added, moved or removed, and when an
 * address is edited, so miles can be worked out again.
 */
export function StopsEditor({
  organizationId,
  defaultStops,
  errors,
  onUpdate,
  onStopsChange,
}: {
  organizationId: string
  defaultStops: StopDefaults[]
  errors: Errors
  onUpdate: (form: HTMLFormElement | null) => void
  onStopsChange?: () => void
}) {
  // Keys count from 0 on every render of the page, so the server and the
  // browser give the inputs the same ids.
  const [rows, setRows] = useState(() => defaultStops.map(toRow))
  const nextKey = useRef(defaultStops.length)
  const listRef = useRef<HTMLOListElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onUpdate(listRef.current?.closest("form") ?? null)
    // Only when the rows change; onUpdate is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  function change(next: Row[], stopsChanged = false) {
    setRows(next)
    if (stopsChanged) onStopsChange?.()
  }

  function patch(key: number, values: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...values } : row))
    )
  }

  function move(index: number, by: -1 | 1) {
    const next = [...rows]
    const [row] = next.splice(index, 1)
    next.splice(index + by, 0, row)
    change(next, true)
  }

  function add(kind: StopKind) {
    const next = [...rows]
    // A pickup goes after the last pickup; a delivery goes at the end.
    const lastPickup = next.findLastIndex((row) => row.kind === "pickup")
    const at = kind === "pickup" ? lastPickup + 1 : next.length
    next.splice(at, 0, toRow({ kind }, nextKey.current++))
    change(next)
  }

  const listError = errors.stops

  return (
    <div className="flex flex-col gap-4">
      <ol ref={listRef} className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const name = (field: string) => `stops.${index}.${field}`
          const error = (field: string) => errors[name(field)]
          const label = `Stop ${index + 1}`
          const id = (field: string) => `stop-${row.key}-${field}`
          const kindLabel = STOP_KIND_LABELS[row.kind]
          const moreErrors =
            !!error("reference_numbers") ||
            !!error("contact_phone") ||
            !!error("notes")
          const open = row.open || moreErrors
          return (
            <li
              key={row.key}
              className="@container overflow-hidden rounded-xl border bg-card"
            >
              {row.id && (
                <input type="hidden" name={name("id")} value={row.id} />
              )}
              <input type="hidden" name={name("kind")} value={row.kind} />
              <input
                type="hidden"
                name={name("appointment_type")}
                value={row.appointment_type}
              />

              {/* Which stop, and moving it around. */}
              <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      row.kind === "pickup"
                        ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    )}
                  >
                    {index + 1}
                  </span>
                  <Select
                    value={row.kind}
                    onValueChange={(value) =>
                      change(
                        rows.map((other) =>
                          other.key === row.key
                            ? { ...other, kind: value as StopKind }
                            : other
                        )
                      )
                    }
                    items={STOP_KINDS.map((value) => ({
                      value,
                      label: STOP_KIND_LABELS[value],
                    }))}
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={`${label} type`}
                      aria-invalid={!!error("kind")}
                      className="w-28 bg-background"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STOP_KINDS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {STOP_KIND_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {error("kind") && <FieldError errors={error("kind")} />}
                </div>
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${label.toLowerCase()} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${label.toLowerCase()} down`}
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${label.toLowerCase()}`}
                    title={
                      row.locked ? "The driver has checked in here" : undefined
                    }
                    disabled={rows.length <= 2 || row.locked}
                    onClick={() =>
                      change(
                        rows.filter((other) => other.key !== row.key),
                        true
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>

              <div className="grid gap-5 p-4 sm:grid-cols-6">
                {/* Where. */}
                <Field
                  data-invalid={!!error("facility")}
                  className="sm:col-span-4"
                >
                  <FieldLabel htmlFor={id("facility")}>
                    {row.kind === "pickup" ? "Shipper" : "Receiver"}
                  </FieldLabel>
                  <Input
                    id={id("facility")}
                    name={name("facility")}
                    defaultValue={row.facility ?? ""}
                    placeholder={
                      row.kind === "pickup"
                        ? "e.g. Walmart DC 6094"
                        : "e.g. Kroger Distribution"
                    }
                    aria-invalid={!!error("facility")}
                  />
                  <FieldError errors={error("facility")} />
                </Field>
                <Field
                  data-invalid={!!error("stop_number")}
                  className="sm:col-span-2"
                >
                  <FieldLabel htmlFor={id("number")}>{kindLabel} #</FieldLabel>
                  <Input
                    id={id("number")}
                    name={name("stop_number")}
                    defaultValue={row.stop_number ?? ""}
                    placeholder="Optional"
                    aria-invalid={!!error("stop_number")}
                  />
                  <FieldError errors={error("stop_number")} />
                </Field>
                <Field
                  data-invalid={!!error("location")}
                  className="sm:col-span-6"
                >
                  <FieldLabel htmlFor={id("location")}>Address</FieldLabel>
                  <AddressInput
                    organizationId={organizationId}
                    id={id("location")}
                    name={name("location")}
                    defaultValue={row.location}
                    placeholder={
                      row.kind === "pickup"
                        ? "Start typing: Walmart DC Bentonville, or a street address"
                        : "Start typing: Kroger Dallas, or a street address"
                    }
                    invalid={!!error("location")}
                    onPick={(picked) => {
                      // A business's name fills an empty shipper or
                      // receiver box.
                      const facility = document.getElementById(
                        id("facility")
                      ) as HTMLInputElement | null
                      if (picked.name && facility && !facility.value.trim()) {
                        facility.value = picked.name
                      }
                    }}
                    onChanged={onStopsChange}
                  />
                  <FieldError errors={error("location")} />
                </Field>

                {/* When. */}
                <div className="flex flex-col gap-3 sm:col-span-6">
                  <ToggleGroup
                    aria-label={`${label} appointment`}
                    variant="outline"
                    size="sm"
                    spacing={0}
                    className="w-full"
                    value={[row.appointment_type]}
                    onValueChange={(value: string[]) =>
                      value[0] &&
                      change(
                        rows.map((other) =>
                          other.key === row.key
                            ? {
                                ...other,
                                appointment_type: value[0] as AppointmentType,
                              }
                            : other
                        )
                      )
                    }
                  >
                    {APPOINTMENT_TYPES.map((type) => (
                      <ToggleGroupItem
                        key={type}
                        value={type}
                        className="flex-1"
                      >
                        {APPOINTMENT_TYPE_LABELS[type]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  {/* Side by side only when the stop card is wide enough. */}
                  <div className="grid gap-5 @lg:grid-cols-2">
                    <DateTimeField
                      // Remounts on a type change, so a TBD date doesn't
                      // carry its hidden midnight into a set time.
                      key={`start-${row.appointment_type === "tbd" ? "date" : "time"}`}
                      name={name("appointment_start")}
                      label={
                        row.appointment_type === "window"
                          ? "Opens"
                          : row.appointment_type === "tbd"
                            ? "Expected date"
                            : "Appointment"
                      }
                      stopLabel={label}
                      dateOnly={row.appointment_type === "tbd"}
                      defaultTime="08:00"
                      defaultValue={row.appointment_start}
                      errors={error("appointment_start")}
                      onUpdate={onUpdate}
                    />
                    {row.appointment_type === "window" && (
                      <DateTimeField
                        name={name("appointment_end")}
                        label="Closes"
                        stopLabel={label}
                        defaultTime="15:00"
                        defaultValue={
                          row.appointment_end ??
                          row.appointment_start?.slice(0, 10).concat("T15:00")
                        }
                        errors={error("appointment_end")}
                        onUpdate={onUpdate}
                      />
                    )}
                  </div>
                  <FieldDescription>
                    {TYPE_HINTS[row.appointment_type]}
                  </FieldDescription>
                </div>

                {/* PO numbers, a phone number and notes, tucked away until
                    needed. Hidden inputs keep their values when closed. */}
                <div className="sm:col-span-6">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-2 text-muted-foreground"
                    aria-expanded={open}
                    onClick={() => patch(row.key, { open: !open })}
                  >
                    <ChevronDown
                      className={cn(
                        "transition-transform",
                        open && "rotate-180"
                      )}
                    />
                    {open ? "Fewer details" : "PO numbers, phone, notes"}
                  </Button>
                  <div
                    className={cn(
                      "mt-3 grid gap-5 sm:grid-cols-6",
                      !open && "hidden"
                    )}
                  >
                    <Field
                      data-invalid={!!error("reference_numbers")}
                      className="sm:col-span-3"
                    >
                      <FieldLabel htmlFor={id("refs")}>PO numbers</FieldLabel>
                      <Input
                        id={id("refs")}
                        name={name("reference_numbers")}
                        defaultValue={row.reference_numbers ?? ""}
                        placeholder="e.g. PO 88213, 88214"
                        aria-invalid={!!error("reference_numbers")}
                      />
                      <FieldError errors={error("reference_numbers")} />
                    </Field>
                    <Field
                      data-invalid={!!error("contact_phone")}
                      className="sm:col-span-3"
                    >
                      <FieldLabel htmlFor={id("phone")}>
                        {row.kind === "pickup" ? "Shipper" : "Receiver"} phone
                      </FieldLabel>
                      <Input
                        id={id("phone")}
                        name={name("contact_phone")}
                        type="tel"
                        defaultValue={row.contact_phone ?? ""}
                        placeholder="Optional"
                        aria-invalid={!!error("contact_phone")}
                      />
                      <FieldError errors={error("contact_phone")} />
                    </Field>
                    <Field
                      data-invalid={!!error("notes")}
                      className="sm:col-span-6"
                    >
                      <FieldLabel htmlFor={id("notes")}>
                        Notes for the driver
                      </FieldLabel>
                      <Textarea
                        id={id("notes")}
                        name={name("notes")}
                        rows={2}
                        maxLength={500}
                        defaultValue={row.notes ?? ""}
                        placeholder="e.g. Call 1 hour before. Dock 4. Lumper paid by receiver."
                        aria-invalid={!!error("notes")}
                      />
                      <FieldError errors={error("notes")} />
                    </Field>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => add("pickup")}
          disabled={rows.length >= 50}
        >
          <MapPin />
          Add pickup
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => add("delivery")}
          disabled={rows.length >= 50}
        >
          <PackageCheck />
          Add delivery
        </Button>
      </div>
      {listError ? (
        <FieldError errors={listError} />
      ) : (
        <FieldDescription>
          In the order they&apos;re run: start with a pickup, end with a
          delivery.
        </FieldDescription>
      )}
    </div>
  )
}
