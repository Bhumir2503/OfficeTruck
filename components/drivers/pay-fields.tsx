"use client"

import { useEffect, useRef, useState } from "react"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PAY_TYPES, PAY_TYPE_LABELS, type PayType } from "@/lib/schemas/driver"
import {
  PAY_PERIOD_LABELS,
  PAY_PERIODS,
  type PayPeriod,
} from "@/lib/settlement-format"

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
 * per load, the rate, and how often they're paid. Fills `pay_type`,
 * `pay_rate` and `pay_period`.
 */
export function PayFields({
  defaultType,
  defaultRate,
  defaultPeriod,
  errors,
  onUpdate,
}: {
  defaultType: PayType | null
  defaultRate: number | null
  /** How often they're paid; a new driver starts weekly. */
  defaultPeriod: PayPeriod
  errors: {
    pay_type?: { message: string }[]
    pay_rate?: { message: string }[]
    pay_period?: { message: string }[]
  }
  onUpdate: (form: HTMLFormElement | null) => void
}) {
  const [type, setType] = useState<PayType | "">(defaultType ?? "")
  const [period, setPeriod] = useState<PayPeriod>(defaultPeriod)
  const hiddenRef = useRef<HTMLInputElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onUpdate(hiddenRef.current?.form ?? null)
    // Only when the type or period changes; onUpdate is a new function
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, period])

  const unit = type ? UNITS[type] : null
  const rateErrors = errors.pay_rate

  return (
    <>
      <Field data-invalid={!!errors.pay_type} className="sm:col-span-3">
        <FieldLabel id="driver-pay-type-label">Paid</FieldLabel>
        <input ref={hiddenRef} type="hidden" name="pay_type" value={type} />
        <Select
          value={type || "none"}
          onValueChange={(value) =>
            setType(!value || value === "none" ? "" : (value as PayType))
          }
          items={[
            { value: "none", label: "Not set" },
            ...PAY_TYPES.map((payType) => ({
              value: payType,
              label: PAY_TYPE_LABELS[payType],
            })),
          ]}
        >
          <SelectTrigger
            id="driver-pay-type"
            aria-labelledby="driver-pay-type-label"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not set</SelectItem>
            {PAY_TYPES.map((payType) => (
              <SelectItem key={payType} value={payType}>
                {PAY_TYPE_LABELS[payType]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
      <Field data-invalid={!!errors.pay_period} className="sm:col-span-3">
        <FieldLabel id="driver-pay-period-label">Paid every</FieldLabel>
        <input type="hidden" name="pay_period" value={period} />
        <Select
          value={period}
          onValueChange={(value) => value && setPeriod(value as PayPeriod)}
          items={PAY_PERIODS.map((value) => ({
            value,
            label: PAY_PERIOD_LABELS[value],
          }))}
        >
          <SelectTrigger
            id="driver-pay-period"
            aria-labelledby="driver-pay-period-label"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAY_PERIODS.map((value) => (
              <SelectItem key={value} value={value}>
                {PAY_PERIOD_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.pay_period ? (
          <FieldError errors={errors.pay_period} />
        ) : (
          <FieldDescription>
            {period === "week"
              ? "Each pay statement covers Monday to Sunday."
              : period === "two_weeks"
                ? "Each pay statement covers two weeks, Monday to Sunday."
                : "Each pay statement covers the 1st to the end of the month."}
          </FieldDescription>
        )}
      </Field>
    </>
  )
}
