"use client"

import { useState, type FormEvent } from "react"
import type { z } from "zod"

type FieldErrors<Values> = Partial<Record<keyof Values, { message: string }[]>>

/**
 * Validates an uncontrolled form against a Zod schema on submit, then
 * re-validates on every change so errors clear as they are fixed. Inputs are
 * matched to schema keys by their `name` attribute.
 *
 * `onValid` runs with the parsed values and may return a message to show as a
 * form-level error.
 */
export function useZodForm<Schema extends z.ZodType<Record<string, unknown>>>(
  schema: Schema,
  onValid: (values: z.output<Schema>) => Promise<string | void>
) {
  type Values = z.input<Schema>

  const [errors, setErrors] = useState<FieldErrors<Values>>({})
  const [attempted, setAttempted] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function validate(form: HTMLFormElement) {
    const result = schema.safeParse(Object.fromEntries(new FormData(form)))
    const nextErrors: Record<string, { message: string }[]> = {}

    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = String(issue.path[0])
        nextErrors[field] = [
          ...(nextErrors[field] ?? []),
          { message: issue.message },
        ]
      }
    }

    setErrors(nextErrors as FieldErrors<Values>)
    return result
  }

  return {
    errors,
    formError,
    pending,
    formProps: {
      noValidate: true,
      async onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setAttempted(true)
        setFormError(null)

        const result = validate(event.currentTarget)
        if (!result.success || pending) {
          return
        }

        setPending(true)
        try {
          setFormError((await onValid(result.data)) || null)
        } catch {
          setFormError("Something went wrong. Please try again.")
        } finally {
          setPending(false)
        }
      },
      onChange(event: FormEvent<HTMLFormElement>) {
        setFormError(null)
        if (attempted) {
          validate(event.currentTarget)
        }
      },
    },
  }
}
