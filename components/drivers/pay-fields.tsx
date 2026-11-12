"use client"

import { useEffect, useRef, useState } from "react"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PAY_TYPES, PAY_TYPE_LABELS, type PayType } from "@/lib/schemas/driver"

const UNITS: Record<
  PayType,
  { prefix?: string; suffix: string; hint: string }
> = {
  per_mile: {
    prefix: "$",
    suffix: "/ mile",
    hint: "The miles on each load × this rate.",
  },
  percent: {
    suffix: "% of load",
    hint: "This share of the load's rate.",
  },
  flat: {
    prefix: "$",
    suffix: "/ load",
    hint: "The same amount for every load.",
  },
}

/** Keeps digits and one ".", at most 3 decimals, with commas in the whole part. */
function formatRate(value: string) {
  const point = value.indexOf(".")
  const whole = (point === -1 ? value : value.slice(0, point))
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, 7)
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  if (point === -1) return grouped
  const decimals = value
    .slice(point + 1)
    .replace(/\D/g, "")
    .slice(0, 3)
  return `${grouped || "0"}.${decimals}`
}

/** Reformats the rate as it's typed, keeping the caret after the same digits. */
function handleRateInput(event: React.ChangeEvent<HTMLInputElement>) {
  const input = event.currentTarget
  const formatted = formatRate(input.value)
  if (formatted === input.value) return
  const caret = input.selectionStart ?? input.value.length
  const kept = formatRate(input.value.slice(0, caret)).replace(/,/g, "").length
  let position = 0
  for (let seen = 0; position < formatted.length && seen < kept; position++) {
    if (formatted[position] !== ",") seen++
  }
  input.value = formatted
  input.setSelectionRange(position, position)
}

/**
 * How the driver is paid: a choice of per mile, percent of the load or flat
 * per load, and the rate. Fills `pay_type` and `pay_rate`.
 */
export function PayFields({
  defaultType,
  defaultRate,
  errors,
  onUpdate,
}: {
  defaultType: PayType | null
  defaultRate: number | null
  errors: {
    pay_type?: { message: string }[]
    pay_rate?: { message: string }[]
  }
  onUpdate: (form: HTMLFormElement | null) => void
}) {
  const [type, setType] = useState<PayType | "">(defaultType ?? "")
  const hiddenRef = useRef<HTMLInputElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onUpdate(hiddenRef.current?.form ?? null)
    // Only when the type changes; onUpdate is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  const unit = type ? UNITS[type] : null
  const rateErrors = errors.pay_rate

  return (
    <>
      <Field data-invalid={!!errors.pay_type} className="sm:col-span-6">
        <FieldLabel id="driver-pay-type-label">Paid</FieldLabel>
        <input ref={hiddenRef} type="hidden" name="pay_type" value={type} />
        <ToggleGroup
          aria-labelledby="driver-pay-type-label"
          variant="outline"
          size="sm"
          spacing={1}
          className="flex-wrap"
          value={[type || "none"]}
          onValueChange={(value: string[]) => {
            const next = value[0]
            // Clicking the selected option again leaves it selected.
            if (next !== undefined) {
              setType(next === "none" ? "" : (next as PayType))
            }
          }}
        >
          <ToggleGroupItem value="none">Not set</ToggleGroupItem>
          {PAY_TYPES.map((payType) => (
            <ToggleGroupItem key={payType} value={payType}>
              {PAY_TYPE_LABELS[payType]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldError errors={errors.pay_type} />
      </Field>
      {unit && (
        <Field data-invalid={!!rateErrors} className="sm:col-span-3">
          <FieldLabel htmlFor="driver-pay-rate">Rate</FieldLabel>
          <div className="relative">
            {unit.prefix && (
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                {unit.prefix}
              </span>
            )}
            <Input
              // A new input per type, so switching types starts it fresh.
              key={type}
              id="driver-pay-rate"
              name="pay_rate"
              inputMode="decimal"
              placeholder={
                type === "per_mile" ? "0.65" : type === "percent" ? "25" : "500"
              }
              defaultValue={
                type === defaultType && defaultRate !== null
                  ? formatRate(String(Number(defaultRate)))
                  : undefined
              }
              aria-invalid={!!rateErrors}
              className={unit.prefix ? "pr-20 pl-6" : "pr-24"}
              onChange={handleRateInput}
            />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">
              {unit.suffix}
            </span>
          </div>
          {rateErrors ? (
            <FieldError errors={rateErrors} />
          ) : (
            <FieldDescription>{unit.hint}</FieldDescription>
          )}
        </Field>
      )}
    </>
  )
}
