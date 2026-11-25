"use client"

import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { estimateLoadEmptyMiles } from "@/app/org/[slug]/loads/actions"
import { formatMiles, handleMilesInput } from "@/components/loads/driver-select"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { EmptyMilesEstimate } from "@/lib/empty-miles"

type Status =
  | { state: "idle" }
  | { state: "working" }
  | { state: "done"; from: string; afterLoad: string | null }
  | { state: "error"; message: string; noOrigin?: boolean }

/**
 * Estimated empty (deadhead) miles: from the truck's last delivery before
 * this load, or its home base, to the first pickup. Worked out again when
 * the truck or the first pickup changes, unless a number was typed in
 * (clearing it hands it back). New Load passes `pickup`; a saved load passes
 * `loadId` and its saved first pickup is used.
 */
export function EmptyMilesField({
  organizationId,
  truckId,
  loadId,
  pickup,
  stopsVersion,
  defaultValue,
  errors,
  trucksBase,
  id = "load-empty-miles",
  onValueChange,
}: {
  organizationId: string
  truckId: string | null
  loadId?: string
  /** New Load: the first pickup in the form right now. */
  pickup?: () => { location: string; start: string | null }
  /** Changes when the stops change, to estimate again. */
  stopsVersion?: number
  defaultValue?: number | null
  errors?: { message: string }[]
  /** /org/<slug>/equipment, to link to the truck for its home base. */
  trucksBase: string
  id?: string
  /** The box's value whenever it changes, typed or estimated. */
  onValueChange?: (value: string) => void
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
  // A saved load keeps its saved number until something changes.
  const changed = useRef(false)

  useEffect(() => {
    onValueChange?.(value)
    // Only when the value changes; the callback is new every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  async function estimate() {
    if (!truckId) {
      runId.current++
      setStatus({ state: "idle" })
      return
    }
    const first = pickup?.()
    if (!loadId && !first?.location.trim()) {
      runId.current++
      setStatus({ state: "idle" })
      return
    }
    const id = ++runId.current
    setStatus({ state: "working" })
    let result: EmptyMilesEstimate
    try {
      result = await estimateLoadEmptyMiles(organizationId, {
        truckId,
        loadId,
        pickupLocation: first?.location,
        pickupStart: first?.start,
      })
    } catch {
      result = { ok: false, error: "Couldn't reach Google Maps." }
    }
    if (id !== runId.current) return
    if (!result.ok) {
      setStatus({
        state: "error",
        message: result.error,
        noOrigin: result.noOrigin,
      })
      return
    }
    setValue(formatMiles(String(result.miles)))
    setStatus({ state: "done", from: result.from, afterLoad: result.afterLoad })
  }

  useEffect(() => {
    // A saved load opens with its saved number.
    if (loadId && !changed.current) {
      changed.current = true
      return
    }
    if (typed) return
    const timer = setTimeout(() => void estimate(), 400)
    return () => clearTimeout(timer)
    // When the truck or the stops change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truckId, stopsVersion, typed])

  const invalid = !!errors?.length
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>Estimated empty miles</FieldLabel>
      <div className="relative">
        <Input
          id={id}
          name="empty_miles"
          inputMode="numeric"
          placeholder={truckId ? "From the truck's last stop" : "e.g. 85"}
          value={value}
          aria-invalid={invalid}
          className={status.state === "working" ? "pr-8" : undefined}
          onChange={(event) => {
            handleMilesInput(event)
            const next = event.currentTarget.value
            runId.current++
            setValue(next)
            // Clearing the box hands the miles back to the estimate.
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
      ) : status.state === "done" ? (
        <FieldDescription>
          From {status.from}
          {status.afterLoad
            ? `, where load ${status.afterLoad} delivers.`
            : ", the truck's home base."}
        </FieldDescription>
      ) : status.state === "error" ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {status.noOrigin && truckId ? (
            <>
              No earlier load to start from.{" "}
              <Link href={`${trucksBase}/${truckId}`} className="underline">
                Add a home base
              </Link>{" "}
              to the truck, or enter the miles yourself.
            </>
          ) : (
            `${status.message} Enter the miles yourself.`
          )}
        </p>
      ) : typed && truckId ? (
        <FieldDescription>
          Typed in. Clear it to estimate again.
        </FieldDescription>
      ) : null}
    </Field>
  )
}
