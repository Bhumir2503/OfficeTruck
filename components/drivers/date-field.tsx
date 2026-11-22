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
  const [value, setValue] = useState(defaultValue ?? "")
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

  const invalid = !!errors?.length

  return (
    <Field data-invalid={invalid} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input ref={hiddenRef} type="hidden" name={name} value={value} />
      <DatePicker
        id={id}
        value={value}
        onChange={setValue}
        invalid={invalid}
        label={label}
      />
      {invalid ? (
        <FieldError errors={errors} />
      ) : (
        hint && <FieldDescription>{hint}</FieldDescription>
      )}
    </Field>
  )
}
