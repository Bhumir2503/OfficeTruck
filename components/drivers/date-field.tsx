"use client"

import { format } from "date-fns"
import { CalendarIcon, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/** "2027-03-04" → a Date at local midnight that day. */
function parseDay(value: string | null | undefined) {
  if (!value) return undefined
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

/**
 * A date picker that fills a hidden input with "YYYY-MM-DD", or leaves it
 * empty. `onUpdate` runs with the form after the value changes, since changes
 * made from state don't fire the form's change event.
 */
export function DateField({
  id,
  name,
  label,
  hint,
  defaultValue,
  errors,
  onUpdate,
  className,
}: {
  id: string
  name: string
  label: string
  hint?: string
  defaultValue?: string | null
  errors?: { message: string }[]
  onUpdate: (form: HTMLFormElement | null) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(() => parseDay(defaultValue))
  const hiddenRef = useRef<HTMLInputElement>(null)
  const firstRender = useRef(true)

  const value = date ? format(date, "yyyy-MM-dd") : ""

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onUpdate(hiddenRef.current?.form ?? null)
    // Only when the value changes; onUpdate is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const invalid = !!errors?.length
  const today = new Date()

  return (
    <Field data-invalid={invalid} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input ref={hiddenRef} type="hidden" name={name} value={value} />
      <div className="relative">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                id={id}
                variant="outline"
                aria-invalid={invalid}
                className="w-full justify-start pr-9 font-normal"
              />
            }
          >
            <CalendarIcon className="text-muted-foreground" />
            {date ? (
              <span className="truncate">{format(date, "MMM d, yyyy")}</span>
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
              defaultMonth={date ?? today}
              captionLayout="dropdown"
              startMonth={new Date(today.getFullYear() - 10, 0)}
              endMonth={new Date(today.getFullYear() + 10, 11)}
              onSelect={(next) => {
                setDate(next)
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
        {date && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Clear ${label.toLowerCase()}`}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
            onClick={() => setDate(undefined)}
          >
            <X />
          </Button>
        )}
      </div>
      {invalid ? (
        <FieldError errors={errors} />
      ) : (
        hint && <FieldDescription>{hint}</FieldDescription>
      )}
    </Field>
  )
}
