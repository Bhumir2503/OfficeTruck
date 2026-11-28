"use client"

import { useEffect, useRef, useState } from "react"

import { DatePicker } from "@/components/ui/date-picker"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"

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
  min,
  max,
}: {
  id: string
  name: string
  label: string
  hint?: string
  defaultValue?: string | null
  errors?: { message: string }[]
  onUpdate: (form: HTMLFormElement | null) => void
  className?: string
  /** Earliest and latest days that can be picked, "YYYY-MM-DD". */
  min?: string
  max?: string
}) {
  const [value, setValue] = useState(defaultValue ?? "")
  const hiddenRef = useRef<HTMLInputElement>(null)
  // Set when the user picks a date, so onUpdate runs for edits only.
  const edited = useRef(false)
  // A new saved date (say, a logged service moving the odometer's date)
  // replaces the shown one, as a text field's new defaultValue does. It
  // isn't an edit, so it doesn't run onUpdate.
  const [saved, setSaved] = useState(defaultValue)
  if (defaultValue !== saved) {
    setSaved(defaultValue)
    setValue(defaultValue ?? "")
  }

  function change(next: string) {
    edited.current = true
    setValue(next)
  }

  useEffect(() => {
    if (!edited.current) {
      return
    }
    edited.current = false
    onUpdate(hiddenRef.current?.form ?? null)
    // Only when the value changes; onUpdate is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const invalid = !!errors?.length

  return (
    <Field data-invalid={invalid} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input ref={hiddenRef} type="hidden" name={name} value={value} />
      <DatePicker
        id={id}
        value={value}
        onChange={change}
        invalid={invalid}
        label={label}
        min={min}
        max={max}
      />
      {invalid ? (
        <FieldError errors={errors} />
      ) : (
        hint && <FieldDescription>{hint}</FieldDescription>
      )}
    </Field>
  )
}
