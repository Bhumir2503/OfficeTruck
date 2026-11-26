"use client"

import { useEffect, useRef, useState } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "cn"

import { assignmentProblems, problemShort } from "@/lib/assignment-compliance"
import { type DriverCandidate, describeDriver } from "@/lib/assignment-match"
import type { DriverOption } from "@/lib/drivers"

const NONE = "none"

/**
 * A driver picker that fills a hidden `driver_id` input ("" for no driver).
 * Lists active drivers, plus the current one if they've since gone inactive.
 * `onUpdate` runs with the form after a change, since a value set from state
 * doesn't fire the form's change event. A driver whose CDL, medical card or
 * yearly checks are past, or run out before `until`, says so in red.
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
  until = null,
  availability,
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
  /** The load's last day, "YYYY-MM-DD", to flag dates that run out by then. */
  until?: string | null
  /** What each driver is doing around the load, to say so and list free ones first. */
  availability?: DriverCandidate[]
}) {
  const doing = new Map(
    (availability ?? []).map((driver) => [driver.driverId, driver])
  )
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

  const options = drivers
    .filter(
      (driver) =>
        driver.status === "active" ||
        driver.id === defaultValue ||
        driver.id === value
    )
    // Free drivers first, once it's known who's busy.
    .sort(
      (a, b) =>
        Number(!!doing.get(a.id)?.busyWith) -
        Number(!!doing.get(b.id)?.busyWith)
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
          {items.map((item) => {
            const driver = options.find((option) => option.id === item.value)
            const problems = driver
              ? assignmentProblems(driver.compliance, until)
              : []
            const status = doing.get(item.value)
            const line = status ? describeDriver(status) : null
            return (
              <SelectItem key={item.value} value={item.value}>
                {item.value === NONE ? (
                  <span className="text-muted-foreground">{item.label}</span>
                ) : problems.length || line ? (
                  <span className="flex flex-col items-start gap-0.5">
                    <span>{item.label}</span>
                    {line && (
                      <span
                        className={cn(
                          "text-xs",
                          line.tone === "warn"
                            ? "text-amber-700 dark:text-amber-300"
                            : "text-muted-foreground"
                        )}
                      >
                        {line.text}
                      </span>
                    )}
                    {problems.length > 0 && (
                      <span className="text-xs text-destructive">
                        {problemShort(problems[0])}
                        {problems.length > 1 &&
                          ` and ${problems.length - 1} more`}
                      </span>
                    )}
                  </span>
                ) : (
                  item.label
                )}
              </SelectItem>
            )
          })}
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
