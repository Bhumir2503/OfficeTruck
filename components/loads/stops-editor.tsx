"use client"

import { cn } from "cn"
import { ArrowDown, ArrowUp, MapPin, PackageCheck, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

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
import { STOP_KINDS, STOP_KIND_LABELS, type StopKind } from "@/lib/schemas/load"

type Errors = Partial<Record<string, { message: string }[]>>

/** A stop as it's saved, to start the editor from. */
export type StopDefaults = {
  id?: string
  kind: StopKind
  location?: string
  appointment_start?: string
  appointment_end?: string | null
  stop_number?: string | null
  /** The driver has checked in here, so it can't be removed. */
  locked?: boolean
}

type Row = StopDefaults & { key: number }

let nextKey = 0
const toRow = (stop: StopDefaults): Row => ({ ...stop, key: nextKey++ })

/**
 * Pickups and deliveries in the order they're run. Fills inputs named
 * "stops.0.kind", "stops.0.location"… for the form around it. Stops can be
 * added, moved and removed; inputs keep what was typed as they move, since
 * each row keeps its key.
 */
export function StopsEditor({
  defaultStops,
  errors,
  onUpdate,
}: {
  defaultStops: StopDefaults[]
  errors: Errors
  onUpdate: (form: HTMLFormElement | null) => void
}) {
  const [rows, setRows] = useState(() => defaultStops.map(toRow))
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

  function move(index: number, by: -1 | 1) {
    const next = [...rows]
    const [row] = next.splice(index, 1)
    next.splice(index + by, 0, row)
    setRows(next)
  }

  function add(kind: StopKind) {
    const next = [...rows]
    // A pickup goes after the last pickup; a delivery goes at the end.
    const lastPickup = next.findLastIndex((row) => row.kind === "pickup")
    const at = kind === "pickup" ? lastPickup + 1 : next.length
    next.splice(at, 0, toRow({ kind }))
    setRows(next)
  }

  const listError = errors.stops

  return (
    <div className="flex flex-col gap-4">
      <ol ref={listRef} className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const name = (field: string) => `stops.${index}.${field}`
          const error = (field: string) => errors[name(field)]
          const label = `Stop ${index + 1}`
          return (
            <li
              key={row.key}
              className="flex flex-col gap-4 rounded-lg border p-4"
            >
              {row.id && (
                <input type="hidden" name={name("id")} value={row.id} />
              )}
              <input type="hidden" name={name("kind")} value={row.kind} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
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
                      setRows(
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
                      className="w-32"
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
                <div className="flex items-center gap-1">
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
                      setRows(rows.filter((other) => other.key !== row.key))
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-6">
                <Field
                  data-invalid={!!error("location")}
                  className="sm:col-span-4"
                >
                  <FieldLabel htmlFor={`stop-${row.key}-location`}>
                    Address
                  </FieldLabel>
                  <Input
                    id={`stop-${row.key}-location`}
                    name={name("location")}
                    defaultValue={row.location}
                    placeholder={
                      row.kind === "pickup"
                        ? "e.g. Walmart DC 6094, 1001 SE 5th St, Bentonville, AR"
                        : "e.g. Kroger DC, 2500 Main St, Dallas, TX"
                    }
                    aria-invalid={!!error("location")}
                  />
                  <FieldError errors={error("location")} />
                </Field>
                <Field
                  data-invalid={!!error("stop_number")}
                  className="sm:col-span-2"
                >
                  <FieldLabel htmlFor={`stop-${row.key}-number`}>
                    {row.kind === "pickup"
                      ? "Pickup number"
                      : "Delivery number"}
                  </FieldLabel>
                  <Input
                    id={`stop-${row.key}-number`}
                    name={name("stop_number")}
                    defaultValue={row.stop_number ?? ""}
                    placeholder="Optional"
                    aria-invalid={!!error("stop_number")}
                  />
                  <FieldError errors={error("stop_number")} />
                </Field>
                <DateTimeField
                  name={name("appointment_start")}
                  label="Appointment"
                  stopLabel={label}
                  hint="Local time at the stop."
                  defaultTime="08:00"
                  defaultValue={row.appointment_start}
                  errors={error("appointment_start")}
                  onUpdate={onUpdate}
                  className="sm:col-span-3"
                />
                <DateTimeField
                  name={name("appointment_end")}
                  label="Window ends (optional)"
                  stopLabel={label}
                  hint="Leave blank for a set appointment."
                  defaultTime="17:00"
                  defaultValue={row.appointment_end}
                  errors={error("appointment_end")}
                  onUpdate={onUpdate}
                  className="sm:col-span-3"
                />
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
