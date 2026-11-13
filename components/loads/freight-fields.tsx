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
import { handleMilesInput } from "@/components/loads/driver-select"
import {
  EQUIPMENT_LABELS,
  EQUIPMENT_TYPES,
  type EquipmentType,
} from "@/lib/schemas/load"

type Errors = Partial<Record<string, { message: string }[]>>

const NONE = "none"

/** A text input with its label, error and hint, named for the load form. */
export function LoadTextField({
  name,
  label,
  errors,
  hint,
  className,
  prefix,
  ...input
}: {
  name: string
  label: string
  errors: Errors
  hint?: React.ReactNode
  className?: string
  /** Shown inside the input, before the value, e.g. "$". */
  prefix?: string
} & Omit<React.ComponentProps<"input">, "name" | "className" | "prefix">) {
  const id = `load-${name.replaceAll("_", "-")}`
  const fieldErrors = errors[name]
  return (
    <Field data-invalid={!!fieldErrors} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {prefix ? (
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
            {prefix}
          </span>
          <Input
            id={id}
            name={name}
            aria-invalid={!!fieldErrors}
            className="pl-6"
            {...input}
          />
        </div>
      ) : (
        <Input id={id} name={name} aria-invalid={!!fieldErrors} {...input} />
      )}
      {fieldErrors ? (
        <FieldError errors={fieldErrors} />
      ) : (
        hint && <FieldDescription>{hint}</FieldDescription>
      )}
    </Field>
  )
}

/**
 * What's being hauled, from the rate con: reference numbers, equipment,
 * commodity, weight and trailer. Lays out in a 6-column grid.
 */
export function FreightFields({
  defaults,
  errors,
  onUpdate,
}: {
  defaults?: {
    reference_numbers?: string | null
    equipment?: EquipmentType | null
    commodity?: string | null
    weight_lbs?: number | null
    trailer_number?: string | null
  }
  errors: Errors
  onUpdate: (form: HTMLFormElement | null) => void
}) {
  const [equipment, setEquipment] = useState<string>(
    defaults?.equipment ?? NONE
  )
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
  }, [equipment])

  const items = [
    { value: NONE, label: "Not set" },
    ...EQUIPMENT_TYPES.map((value) => ({
      value,
      label: EQUIPMENT_LABELS[value],
    })),
  ]

  return (
    <>
      <LoadTextField
        name="reference_numbers"
        label="Reference numbers"
        placeholder="e.g. PO 88213, SO 4471"
        hint="PO, order or other numbers the shipper or receiver goes by."
        defaultValue={defaults?.reference_numbers ?? ""}
        errors={errors}
        className="sm:col-span-6"
      />
      <Field data-invalid={!!errors.equipment} className="sm:col-span-2">
        <FieldLabel htmlFor="load-equipment">Equipment</FieldLabel>
        <input
          ref={hiddenRef}
          type="hidden"
          name="equipment"
          value={equipment === NONE ? "" : equipment}
        />
        <Select
          value={equipment}
          onValueChange={(value) =>
            setEquipment((value as string | null) ?? NONE)
          }
          items={items}
        >
          <SelectTrigger
            id="load-equipment"
            aria-invalid={!!errors.equipment}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.value === NONE ? (
                  <span className="text-muted-foreground">{item.label}</span>
                ) : (
                  item.label
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError errors={errors.equipment} />
      </Field>
      <LoadTextField
        name="commodity"
        label="Commodity"
        placeholder="e.g. Paper goods"
        defaultValue={defaults?.commodity ?? ""}
        errors={errors}
        className="sm:col-span-2"
      />
      <LoadTextField
        name="weight_lbs"
        label="Weight (lbs)"
        inputMode="numeric"
        placeholder="e.g. 42,000"
        defaultValue={
          defaults?.weight_lbs != null
            ? defaults.weight_lbs.toLocaleString("en-US")
            : ""
        }
        errors={errors}
        className="sm:col-span-2"
        onChange={handleMilesInput}
      />
      <LoadTextField
        name="trailer_number"
        label="Trailer number"
        placeholder="e.g. 53104"
        defaultValue={defaults?.trailer_number ?? ""}
        errors={errors}
        className="sm:col-span-2"
      />
    </>
  )
}
