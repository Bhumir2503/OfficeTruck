"use client"

import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/**
 * A date picker and a time input that together fill one hidden input with
 * "YYYY-MM-DDTHH:mm", the wall-clock time at the stop. The time starts at
 * `defaultTime`, so people see what a time looks like, but only counts once a
 * date is picked: with no date the field is empty. A date with the time
 * cleared is sent as "2026-11-14T", so validation reports it.
 *
 * `onUpdate` runs with the form after the hidden input changes, since
 * changes made from state don't fire the form's change event.
 */
export function DateTimeField({
  name,
  label,
  stopLabel,
  hint,
  defaultTime = "",
  errors,
  onUpdate,
  className,
}: {
  name: string
  label: string
  /** Which stop, so the date and time controls get names like "Pickup from date". */
  stopLabel: string
  hint?: string
  /** "HH:mm" to start the time input at. */
  defaultTime?: string
  errors?: { message: string }[]
  onUpdate: (form: HTMLFormElement | null) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState<Date | undefined>()
  const [time, setTime] = useState(defaultTime)
  const hiddenRef = useRef<HTMLInputElement>(null)
  const firstRender = useRef(true)

  const day = date ? format(date, "yyyy-MM-dd") : ""
  const value = day ? `${day}T${time}` : ""

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onUpdate(hiddenRef.current?.form ?? null)
    // Only when the value changes; onUpdate is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const id = `load-${name.replaceAll("_", "-")}`
  const invalid = !!errors?.length
  // "To (optional)" → "to"
  const fieldName = label.replace(/\s*\(.*\)$/, "").toLowerCase()

  return (
    <Field data-invalid={invalid} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input ref={hiddenRef} type="hidden" name={name} value={value} />
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                id={id}
                variant="outline"
                aria-invalid={invalid}
                aria-label={`${stopLabel} ${fieldName} date`}
                className="min-w-0 flex-1 justify-start font-normal"
              />
            }
          >
            <CalendarIcon className="text-muted-foreground" />
            {date ? (
              <span className="truncate">
                {format(date, "EEE, MMM d, yyyy")}
              </span>
            ) : (
              <span className="truncate text-muted-foreground">
                Pick a date
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              defaultMonth={date}
              captionLayout="dropdown"
              onSelect={(next) => {
                setDate(next)
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
        <Input
          type="time"
          aria-label={`${stopLabel} ${fieldName} time`}
          aria-invalid={invalid}
          value={time}
          onChange={(event) => setTime(event.target.value)}
          className="w-32 shrink-0 appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
        />
      </div>
      {invalid ? (
        <FieldError errors={errors} />
      ) : (
        hint && <FieldDescription>{hint}</FieldDescription>
      )}
    </Field>
  )
}
