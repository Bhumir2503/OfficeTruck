"use client"

import { CornerDownLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { updateTruckCosts } from "@/app/org/[slug]/equipment/actions"
import { money, TextField } from "@/components/trucks/truck-form"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import {
  handleCurrencyBlur,
  handleCurrencyInput,
  handleCurrencyKeyDown,
} from "@/lib/currency"
import type { Truck } from "@/lib/trucks"

const FIELDS = [
  { name: "monthly_payment", label: "Payment or lease" },
  { name: "monthly_insurance", label: "Insurance" },
  { name: "monthly_other_costs", label: "Other fixed costs" },
] as const

type Costs = Record<(typeof FIELDS)[number]["name"], string>

function costValues(form: HTMLFormElement): Costs {
  const data = new FormData(form)
  const value = (name: keyof Costs) =>
    String(data.get(name) ?? "").replace(/[$,\s]/g, "")
  return {
    monthly_payment: value("monthly_payment"),
    monthly_insurance: value("monthly_insurance"),
    monthly_other_costs: value("monthly_other_costs"),
  }
}

/** "1,850.00" and "1850" are the same amount; blank stays blank. */
const same = (a: string, b: string) =>
  a === "" || b === "" ? a === b : Number(a) === Number(b)

/**
 * A truck's fixed costs, a card on the truck page saved on its own. Owners
 * and admins only.
 */
export function TruckCostsBox({
  organizationId,
  truck,
}: {
  organizationId: string
  truck: Pick<
    Truck,
    "id" | "monthly_payment" | "monthly_insurance" | "monthly_other_costs"
  >
}) {
  const router = useRouter()
  const [saving, startSave] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [changed, setChanged] = useState(false)

  const saved: Costs = {
    monthly_payment: String(truck.monthly_payment ?? ""),
    monthly_insurance: String(truck.monthly_insurance ?? ""),
    monthly_other_costs: String(truck.monthly_other_costs ?? ""),
  }

  function check(form: HTMLFormElement) {
    const now = costValues(form)
    setChanged(FIELDS.some(({ name }) => !same(now[name], saved[name])))
    setError(null)
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = costValues(event.currentTarget)
    startSave(async () => {
      const result = await updateTruckCosts(organizationId, truck.id, values)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setChanged(false)
      toast.success("Fixed costs saved.")
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={save}
      onChange={(event) => check(event.currentTarget)}
      // Blur reformats the amount ("1850" → "1,850.00") without a change event.
      onBlur={(event) => check(event.currentTarget)}
      autoComplete="off"
    >
      <SettingsCard
        title="Monthly fixed costs"
        className="@container"
        // On one line once the card is wide enough for the amounts; stacked on a phone.
        contentClassName="grid gap-5 @md:grid-cols-3 @md:items-end"
        footer={
          <SettingsCardFooter
            hint={error && <span className="text-destructive">{error}</span>}
          >
            <Button type="submit" size="sm" disabled={saving || !changed}>
              {saving ? "Saving…" : "Save"} <CornerDownLeft />
            </Button>
          </SettingsCardFooter>
        }
      >
        <fieldset disabled={saving} className="contents">
          {FIELDS.map(({ name, label }) => (
            <TextField
              key={name}
              name={name}
              label={label}
              prefix="$"
              inputMode="decimal"
              placeholder="0.00"
              defaultValue={money(truck[name])}
              errors={{}}
              onChange={handleCurrencyInput}
              onKeyDown={handleCurrencyKeyDown}
              onBlur={handleCurrencyBlur}
            />
          ))}
        </fieldset>
      </SettingsCard>
    </form>
  )
}
