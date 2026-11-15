"use client"

import { Loader2, Route } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import {
  calculateLoadMiles,
  calculateRouteMiles,
} from "@/app/org/[slug]/loads/actions"
import { formatMiles, handleMilesInput } from "@/components/loads/driver-select"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { RouteMiles } from "@/lib/route-miles"

type Status =
  | { state: "idle" }
  | { state: "working" }
  | { state: "done"; miles: number; hours: number }
  | { state: "error"; message: string }

/**
 * Loaded miles, filled in from the stops by Google Maps. On New Load the
 * addresses come from the form (`addresses`) and miles are worked out again
 * each time `stopsVersion` changes, until someone types the miles in
 * themselves. On a saved load (`loadId`), the saved stops are used when
 * "From stops" is pressed.
 */
export function RouteMilesField({
  organizationId,
  loadId,
  addresses,
  stopsVersion,
  defaultValue,
  errors,
}: {
  organizationId: string
  /** A saved load: route its saved stops. */
  loadId?: string
  /** New Load: the stop addresses in the form right now, in order. */
  addresses?: () => string[]
  /** Changes when the stops change, to work miles out again. */
  stopsVersion?: number
  defaultValue?: number | null
  errors?: { message: string }[]
}) {
  const [value, setValue] = useState(
    defaultValue === null || defaultValue === undefined
      ? ""
      : formatMiles(String(defaultValue))
  )
  const [status, setStatus] = useState<Status>({ state: "idle" })
  // Typed in by a person: leave it alone from then on.
  const typed = useRef(defaultValue !== null && defaultValue !== undefined)
  const runId = useRef(0)

  async function calculate(auto: boolean) {
    const list = addresses?.()
    if (auto && (!list || list.length < 2 || list.some((a) => !a.trim()))) {
      return
    }
    const id = ++runId.current
    setStatus({ state: "working" })
    let result: RouteMiles
    try {
      result = loadId
        ? await calculateLoadMiles(organizationId, loadId)
        : await calculateRouteMiles(organizationId, list ?? [])
    } catch {
      result = { ok: false, error: "Couldn't reach Google Maps. Try again." }
    }
    if (id !== runId.current) return
    if (!result.ok) {
      // A quiet try that didn't work isn't worth a red message.
      setStatus(
        auto ? { state: "idle" } : { state: "error", message: result.error }
      )
      return
    }
    typed.current = false
    setValue(formatMiles(String(result.miles)))
    setStatus({ state: "done", miles: result.miles, hours: result.hours })
  }

  // New Load: work the miles out again when the stops change, unless
  // they were typed in.
  useEffect(() => {
    if (!stopsVersion || typed.current || loadId) return
    const timer = setTimeout(() => void calculate(true), 400)
    return () => clearTimeout(timer)
    // Only when the stops change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsVersion])

  const invalid = !!errors?.length
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor="load-miles">Loaded miles</FieldLabel>
      <div className="flex gap-1.5">
        <Input
          id="load-miles"
          name="miles"
          inputMode="numeric"
          placeholder="e.g. 1,240"
          value={value}
          aria-invalid={invalid}
          onChange={(event) => {
            handleMilesInput(event)
            typed.current = true
            runId.current++
            setValue(event.currentTarget.value)
            if (status.state !== "idle") setStatus({ state: "idle" })
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={status.state === "working"}
          title="Work out the miles from the stops with Google Maps"
          onClick={() => void calculate(false)}
        >
          {status.state === "working" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Route />
          )}
          From stops
        </Button>
      </div>
      {invalid ? (
        <FieldError errors={errors} />
      ) : status.state === "error" ? (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
          {status.message}
        </p>
      ) : status.state === "done" ? (
        <FieldDescription>
          From Google Maps: about {status.hours} hours of driving. Routed for a
          car, so a truck route can run a little longer.
        </FieldDescription>
      ) : status.state === "working" ? (
        <FieldDescription>Working out the miles…</FieldDescription>
      ) : null}
    </Field>
  )
}
