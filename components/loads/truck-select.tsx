"use client"

import { useEffect, useRef, useState } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TruckOption } from "@/lib/trucks"

const NONE = "none"

/**
 * A truck picker that fills a hidden `truck_id` input ("" for no truck).
 * Lists active trucks, plus the current one if it's since been parked or
 * retired. `onPick` gets the chosen truck, e.g. to prefill its driver.
 */
export function TruckSelect({
  id,
  trucks,
  defaultValue,
  invalid,
  onPick,
  onUpdate,
}: {
  id: string
  trucks: TruckOption[]
  defaultValue?: string | null
  invalid?: boolean
  onPick?: (truck: TruckOption | null) => void
  onUpdate: (form: HTMLFormElement | null) => void
}) {
  const [value, setValue] = useState(defaultValue ?? NONE)
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

  const options = trucks.filter(
    (truck) => truck.status === "active" || truck.id === defaultValue
  )
  const items = [
    { value: NONE, label: "No truck" },
    ...options.map((truck) => ({
      value: truck.id,
      label:
        truck.status === "active"
          ? truck.unit_number
          : `${truck.unit_number} (${truck.status === "inactive" ? "inactive" : "out of service"})`,
    })),
  ]

  return (
    <>
      <input
        ref={hiddenRef}
        type="hidden"
        name="truck_id"
        value={value === NONE ? "" : value}
      />
      <Select
        value={value}
        onValueChange={(next) => {
          const chosen = (next as string | null) ?? NONE
          setValue(chosen)
          onPick?.(trucks.find((truck) => truck.id === chosen) ?? null)
        }}
        items={items}
      >
        <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
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
    </>
  )
}
