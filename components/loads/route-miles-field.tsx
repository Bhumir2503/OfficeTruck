"use client"

import { Loader2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { calculateRouteMiles } from "@/app/org/[slug]/loads/actions"
import { formatMiles, handleMilesInput } from "@/components/loads/driver-select"
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
  | { state: "done"; hours: number }
  | { state: "error"; message: string }

/**
 * Estimated loaded miles: the real number isn't known until the load is
 * delivered. On New Load (`addresses`) Google Maps works them out from the
 * stops each time `stopsVersion` changes, unless someone types a number in
 * (clearing it hands it back to Google). On a saved load they're
 * re-estimated on the server when the stops are saved, so the field just
 * shows them and can be changed by hand.
 */
export function RouteMilesField({
  organizationId,
  addresses,
  stopsVersion,
  defaultValue,
  errors,
}: {
  organizationId: string
  /** New Load: the stop addresses in the form right now, in order. */
  addresses?: () => string[]
  /** Changes when the stops change, to estimate again. */
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
  // Typed in by a person: left alone until the box is cleared.
  const [typed, setTyped] = useState(false)
  const runId = useRef(0)
  const live = !!addresses

  async function estimate() {
    const list = addresses?.() ?? []
    // Not every stop has an address yet: nothing to route.
    if (list.length < 2 || list.some((address) => !address.trim())) {
      runId.current++
      setStatus({ state: "idle" })
      return
    }
    const id = ++runId.current
    setStatus({ state: "working" })
    let result: RouteMiles
    try {
      result = await calculateRouteMiles(organizationId, list)
    } catch {
      result = { ok: false, error: "Couldn't reach Google Maps." }
    }
    if (id !== runId.current) return
    if (!result.ok) {
      setStatus({ state: "error", message: result.error })
      return
    }
    setValue(formatMiles(String(result.miles)))
    setStatus({ state: "done", hours: result.hours })
  }

  // Estimate again when the stops change, unless the miles were typed in.
  useEffect(() => {
    if (!live || !stopsVersion || typed) return
    const timer = setTimeout(() => void estimate(), 400)
    return () => clearTimeout(timer)
    // Only when the stops change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsVersion, typed])

  const invalid = !!errors?.length
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor="load-miles">Estimated loaded miles</FieldLabel>
      <div className="relative">
        <Input
          id="load-miles"
          name="miles"
          inputMode="numeric"
          placeholder={live ? "Worked out from the stops" : "e.g. 1,240"}
          value={value}
          aria-invalid={invalid}
          className={status.state === "working" ? "pr-8" : undefined}
          onChange={(event) => {
            handleMilesInput(event)
            const next = event.currentTarget.value
            runId.current++
            setValue(next)
            // Clearing the box hands the miles back to Google Maps.
            setTyped(next !== "")
            setStatus({ state: "idle" })
          }}
        />
        {status.state === "working" && (
          <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {invalid ? (
        <FieldError errors={errors} />
      ) : status.state === "error" ? (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
          {status.message} Enter the miles yourself.
        </p>
      ) : (
        <FieldDescription>
          {status.state === "working"
            ? "Estimating from the stops…"
            : status.state === "done"
              ? `Estimated by Google Maps: about ${status.hours} hours of driving. Routed for a car, so a truck route can run a little longer.`
              : typed && live
                ? "Typed in. Clear it to estimate from the stops again."
                : live
                  ? "Estimated from the stops by Google Maps once every address is in."
                  : "Estimated from the stops by Google Maps when they're saved. Change it if you know better."}
        </FieldDescription>
      )}
    </Field>
  )
}
