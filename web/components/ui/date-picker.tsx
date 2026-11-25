"use client"

import { format } from "date-fns"
import { cn } from "cn"
import { CalendarIcon, X } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/** "2027-03-04" → a Date at local midnight that day. */
export function parseDay(value: string | null | undefined) {
  if (!value) return undefined
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day)
}

/**
 * The app's date picker: a button showing the date that opens a calendar.
 * Takes and gives "YYYY-MM-DD" ("" when empty), so it drops in where a
 * date input was. With `name` it also fills an input for forms that read
 * their values on submit, and with `required` that input stops the form
 * submitting without a date, as a date input would.
 */
export function DatePicker({
  id,
  name,
  value,
  onChange,
  min,
  max,
  required = false,
  invalid = false,
  placeholder = "Pick a date",
  label,
  years = { back: 10, ahead: 10 },
  "aria-label": ariaLabel,
  className,
}: {
  id?: string
  name?: string
  /** "YYYY-MM-DD", or "" for none. */
  value: string
  onChange: (value: string) => void
  /** Earliest and latest days that can be picked, "YYYY-MM-DD". */
  min?: string
  max?: string
  /** Hides the clear button: a value is needed. */
  required?: boolean
  invalid?: boolean
  placeholder?: string
  /** For the clear button's name, e.g. "Last day". */
  label?: string
  /** How far the year dropdown reaches from this year. */
  years?: { back: number; ahead: number }
  /** Names the button when there's no label beside it. */
  "aria-label"?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const date = parseDay(value)
  const from = parseDay(min)
  const to = parseDay(max)
  const today = new Date()
  const disabled = [
    ...(from ? [{ before: from }] : []),
    ...(to ? [{ after: to }] : []),
  ]

  return (
    <div className={cn("relative", className)}>
      {(name || required) && (
        // Carries the value for the form, and the browser's "fill this in"
        // check when it's required. Unseen; the button is what's used.
        <input
          tabIndex={-1}
          aria-hidden
          name={name}
          required={required}
          value={value}
          onChange={() => {}}
          onFocus={() => setOpen(true)}
          className="pointer-events-none absolute bottom-0 left-4 size-px opacity-0"
        />
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              aria-label={ariaLabel}
              aria-invalid={invalid || undefined}
              className={cn(
                "w-full justify-start font-normal",
                // Room for the clear button.
                date && !required && "pr-9"
              )}
            />
          }
        >
          <CalendarIcon className="text-muted-foreground" />
          {date ? (
            <span className="truncate">{format(date, "MMM d, yyyy")}</span>
          ) : (
            <span className="truncate text-muted-foreground">
              {placeholder}
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="single"
            // Required: picking the chosen day again doesn't clear it.
            required={required}
            selected={date}
            defaultMonth={date ?? to ?? today}
            captionLayout="dropdown"
            startMonth={from ?? new Date(today.getFullYear() - years.back, 0)}
            endMonth={to ?? new Date(today.getFullYear() + years.ahead, 11)}
            disabled={disabled.length ? disabled : undefined}
            onSelect={(next: Date | undefined) => {
              onChange(next ? format(next, "yyyy-MM-dd") : "")
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      {date && !required && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label ? `Clear ${label.toLowerCase()}` : "Clear date"}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
          onClick={() => onChange("")}
        >
          <X />
        </Button>
      )}
    </div>
  )
}
