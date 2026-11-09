"use client"

import { useState, type FormEvent } from "react"
import type { z } from "zod"

type FieldErrors<Values> = Partial<Record<keyof Values, { message: string }[]>>

/**
 * Validates an uncontrolled form against a Zod schema on submit, then
 * re-validates on every change so errors clear as they are fixed. Inputs are
 * matched to schema keys by their `name` attribute.
 */
export function useZodForm<Schema extends z.ZodType<Record<string, unknown>>>(
  schema: Schema
) {
  type Values = z.input<Schema>

  const [errors, setErrors] = useState<FieldErrors<Values>>({})
  const [attempted, setAttempted] = useState(false)
  const [submitted, setSubmitted] = useState(false)

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
    return result.success
  }

  return {
    errors,
    submitted,
    formProps: {
      noValidate: true,
      onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setAttempted(true)
        setSubmitted(validate(event.currentTarget))
      },
      onChange(event: FormEvent<HTMLFormElement>) {
        setSubmitted(false)
        if (attempted) {
          validate(event.currentTarget)
        }
      },
    },
  }
}
