"use client"

import { Plus, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
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
import {
  formatCurrency,
  handleCurrencyBlur,
  handleCurrencyInput,
  handleCurrencyKeyDown,
} from "@/lib/currency"
import { formatRate } from "@/lib/load-format"
import {
  CHARGE_KINDS,
  CHARGE_KIND_LABELS,
  type ChargeKind,
} from "@/lib/schemas/load"

type Errors = Partial<Record<string, { message: string }[]>>

export type ChargeDefaults = {
  kind: ChargeKind
  description?: string | null
  amount?: number | null
}

type Row = ChargeDefaults & { key: number }

let nextKey = 0
const toRow = (charge: ChargeDefaults): Row => ({ ...charge, key: nextKey++ })

const amountText = (amount: number | null | undefined) =>
  amount === null || amount === undefined
    ? ""
    : formatCurrency(Number(amount).toFixed(2))

/** Sums the amount inputs inside `root`. */
function sumAmounts(root: HTMLElement | null) {
  if (!root) return 0
  let total = 0
  for (const input of root.querySelectorAll<HTMLInputElement>(
    'input[name$=".amount"]'
  )) {
    const value = Number(input.value.replace(/[$,\s]/g, ""))
    if (Number.isFinite(value)) total += value
  }
  return total
}

/**
 * The rate con's charges, one line each, and its detention terms. Fills
 * inputs named "charges.0.kind", "charges.0.amount"… plus
 * "detention_free_hours" and "detention_rate". Lines left blank are dropped
 * when saved.
 */
export function ChargesEditor({
  defaultCharges,
  defaultDetention,
  errors,
  onUpdate,
}: {
  defaultCharges: ChargeDefaults[]
  defaultDetention?: { free_hours: number | null; rate: number | null }
  errors: Errors
  onUpdate: (form: HTMLFormElement | null) => void
}) {
  const [rows, setRows] = useState(() => defaultCharges.map(toRow))
  const [total, setTotal] = useState(() =>
    defaultCharges.reduce((sum, charge) => sum + Number(charge.amount ?? 0), 0)
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    setTotal(sumAmounts(rootRef.current))
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onUpdate(rootRef.current?.closest("form") ?? null)
    // Only when the rows change; onUpdate is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  const listError = errors.charges

  return (
    <div
      ref={rootRef}
      className="flex flex-col gap-5"
      onInput={() => setTotal(sumAmounts(rootRef.current))}
    >
      <div className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const name = (field: string) => `charges.${index}.${field}`
          const error = (field: string) => errors[name(field)]
          const label = `Charge ${index + 1}`
          return (
            <div key={row.key} className="grid gap-3 sm:grid-cols-12">
              <input type="hidden" name={name("kind")} value={row.kind} />
              <Field className="sm:col-span-3">
                {index === 0 && (
                  <FieldLabel htmlFor={`charge-${row.key}-kind`}>
                    Charge
                  </FieldLabel>
                )}
                <Select
                  value={row.kind}
                  onValueChange={(value) =>
                    setRows(
                      rows.map((other) =>
                        other.key === row.key
                          ? { ...other, kind: value as ChargeKind }
                          : other
                      )
                    )
                  }
                  items={CHARGE_KINDS.map((value) => ({
                    value,
                    label: CHARGE_KIND_LABELS[value],
                  }))}
                >
                  <SelectTrigger
                    id={`charge-${row.key}-kind`}
                    aria-label={`${label} type`}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHARGE_KINDS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {CHARGE_KIND_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                data-invalid={!!error("description")}
                className="sm:col-span-5"
              >
                {index === 0 && (
                  <FieldLabel htmlFor={`charge-${row.key}-description`}>
                    Note
                  </FieldLabel>
                )}
                <Input
                  id={`charge-${row.key}-description`}
                  name={name("description")}
                  aria-label={index === 0 ? undefined : `${label} note`}
                  defaultValue={row.description ?? ""}
                  placeholder="Optional"
                  aria-invalid={!!error("description")}
                />
                <FieldError errors={error("description")} />
              </Field>
              <Field data-invalid={!!error("amount")} className="sm:col-span-3">
                {index === 0 && (
                  <FieldLabel htmlFor={`charge-${row.key}-amount`}>
                    Amount
                  </FieldLabel>
                )}
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id={`charge-${row.key}-amount`}
                    name={name("amount")}
                    aria-label={index === 0 ? undefined : `${label} amount`}
                    inputMode="decimal"
                    placeholder="0.00"
                    defaultValue={amountText(row.amount)}
                    className="pl-6 text-right tabular-nums"
                    aria-invalid={!!error("amount")}
                    onChange={handleCurrencyInput}
                    onKeyDown={handleCurrencyKeyDown}
                    onBlur={handleCurrencyBlur}
                  />
                </div>
                <FieldError errors={error("amount")} />
              </Field>
              <div
                className={
                  index === 0
                    ? "flex items-end sm:col-span-1"
                    : "flex sm:col-span-1"
                }
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${label.toLowerCase()}`}
                  disabled={rows.length <= 1}
                  onClick={() =>
                    setRows(rows.filter((other) => other.key !== row.key))
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          )
        })}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rows.length >= 20}
            onClick={() => setRows([...rows, toRow({ kind: "other" })])}
          >
            <Plus />
            Add line
          </Button>
          <p className="text-sm">
            <span className="text-muted-foreground">Total </span>
            <span className="font-semibold tabular-nums">
              {formatRate(total)}
            </span>
          </p>
        </div>
        {listError ? (
          <FieldError errors={listError} />
        ) : (
          <FieldDescription>
            Linehaul and fuel surcharge on their own lines. Blank lines are
            skipped.
          </FieldDescription>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field data-invalid={!!errors.detention_free_hours}>
          <FieldLabel htmlFor="detention-free-hours">
            Detention free hours
          </FieldLabel>
          <Input
            id="detention-free-hours"
            name="detention_free_hours"
            inputMode="decimal"
            placeholder="e.g. 2"
            defaultValue={defaultDetention?.free_hours ?? ""}
            aria-invalid={!!errors.detention_free_hours}
          />
          {errors.detention_free_hours ? (
            <FieldError errors={errors.detention_free_hours} />
          ) : (
            <FieldDescription>
              At each stop, from the rate con.
            </FieldDescription>
          )}
        </Field>
        <Field data-invalid={!!errors.detention_rate}>
          <FieldLabel htmlFor="detention-rate">Detention per hour</FieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <Input
              id="detention-rate"
              name="detention_rate"
              inputMode="decimal"
              placeholder="e.g. 50.00"
              defaultValue={amountText(defaultDetention?.rate)}
              className="pl-6"
              aria-invalid={!!errors.detention_rate}
              onChange={handleCurrencyInput}
              onKeyDown={handleCurrencyKeyDown}
              onBlur={handleCurrencyBlur}
            />
          </div>
          {errors.detention_rate ? (
            <FieldError errors={errors.detention_rate} />
          ) : (
            <FieldDescription>After the free hours run out.</FieldDescription>
          )}
        </Field>
      </div>
    </div>
  )
}
