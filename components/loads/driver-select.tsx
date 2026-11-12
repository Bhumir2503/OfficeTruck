"use client"

import { useEffect, useRef, useState } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { DriverOption } from "@/lib/drivers"

const NONE = "none"

/**
 * A driver picker that fills a hidden `driver_id` input ("" for no driver).
 * Lists active drivers, plus the current one if they've since gone inactive.
 * `onUpdate` runs with the form after a change, since a value set from state
 * doesn't fire the form's change event.
 */
export function DriverSelect({
  id,
  name = "driver_id",
  drivers,
  defaultValue,
  value: controlled,
  onValueChange,
  invalid,
  onUpdate,
}: {
  id: string
  /** The hidden input's name. */
  name?: string
  drivers: DriverOption[]
  defaultValue?: string | null
  /** Set to control the choice from outside, e.g. to prefill it. */
  value?: string | null
  onValueChange?: (value: string | null) => void
  invalid?: boolean
  onUpdate: (form: HTMLFormElement | null) => void
}) {
  const [own, setOwn] = useState(defaultValue ?? NONE)
  const value = controlled !== undefined ? (controlled ?? NONE) : own
  const setValue = (next: string) => {
    if (controlled === undefined) setOwn(next)
    onValueChange?.(next === NONE ? null : next)
  }
  const hiddenRef = useRef<HTMLInputElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onUpdate(hiddenRef.current?.form ?? null)
    // Only when the value changes; onUpdate is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const options = drivers.filter(
    (driver) =>
      driver.status === "active" ||
      driver.id === defaultValue ||
      driver.id === value
  )
  const items = [
    { value: NONE, label: "No driver" },
    ...options.map((driver) => ({
      value: driver.id,
      label:
        driver.status === "active"
          ? driver.full_name
          : `${driver.full_name} (inactive)`,
    })),
  ]

  return (
    <>
      <input
        ref={hiddenRef}
        type="hidden"
        name={name}
        value={value === NONE ? "" : value}
      />
      <Select
        value={value}
        onValueChange={(next) => setValue((next as string | null) ?? NONE)}
        items={items}
      >
        <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.value === NONE ? (
                <span className="text-muted-foreground">{item.label}</span>
              ) : (
                item.label
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}

/** Whole miles with commas as they're typed: "1240" → "1,240". */
export function formatMiles(value: string) {
  return value
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, 6)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

export function handleMilesInput(event: React.ChangeEvent<HTMLInputElement>) {
  const input = event.currentTarget
  const formatted = formatMiles(input.value)
  if (formatted === input.value) return
  const caret = input.selectionStart ?? input.value.length
  const digitsBefore = input.value.slice(0, caret).replace(/\D/g, "").length
  let position = 0
  for (
    let seen = 0;
    position < formatted.length && seen < digitsBefore;
    position++
  ) {
    if (formatted[position] !== ",") seen++
  }
  input.value = formatted
  input.setSelectionRange(position, position)
}
