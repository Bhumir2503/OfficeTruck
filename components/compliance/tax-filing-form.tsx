"use client"

import { CornerDownLeft } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { saveTaxFiling } from "@/app/org/[slug]/compliance/actions"
import { DateField } from "@/components/drivers/date-field"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TRUCK_STATUS_LABELS, taxFilingSchema } from "@/lib/schemas/truck"
import { formatTaxYear, taxYearDueDate } from "@/lib/truck-format"
import { formatDate } from "@/lib/driver-format"
import type { TaxFiling, Truck } from "@/lib/trucks"

type FilingTruck = Pick<Truck, "id" | "unit_number" | "vin" | "status">

/** The fields for one tax year, reset whenever the year changes. */
function FilingFields({
  organizationId,
  taxYear,
  filing,
  trucks,
}: {
  organizationId: string
  taxYear: number
  filing: TaxFiling | null
  trucks: FilingTruck[]
}) {
  // A new return starts with every active truck ticked.
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        filing?.truck_ids ??
          trucks.filter((truck) => truck.status === "active").map((t) => t.id)
      )
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  // Retired trucks only show up if this return already lists them.
  const listed = trucks.filter(
    (truck) => truck.status !== "inactive" || selected.has(truck.id)
  )
  const missingVin = listed.filter(
    (truck) => selected.has(truck.id) && !truck.vin
  )

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const parsed = taxFilingSchema.safeParse({
      tax_year: taxYear,
      filed_on: data.get("filed_on"),
      notes: data.get("notes"),
      truck_ids: [...selected],
    })
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ])
        )
      )
      return
    }
    setErrors({})
    setPending(true)
    const result = await saveTaxFiling(organizationId, parsed.data)
    setPending(false)
    if ("error" in result) {
      setErrors({ form: result.error })
    } else {
      toast.success(`2290 for ${formatTaxYear(taxYear)} saved.`)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <fieldset disabled={pending} className="contents">
        <div className="grid gap-5 px-6 pt-5 pb-6 sm:grid-cols-2">
          <DateField
            id="tax-filing-filed-on"
            name="filed_on"
            label="Filed on"
            hint={`Due by ${formatDate(taxYearDueDate(taxYear))}.`}
            defaultValue={filing?.filed_on}
            errors={
              errors.filed_on ? [{ message: errors.filed_on }] : undefined
            }
            onUpdate={() =>
              setErrors((current) => {
                const next = { ...current }
                delete next.filed_on
                return next
              })
            }
          />
          <Field className="sm:col-span-2">
            <FieldLabel>Trucks on this return</FieldLabel>
            {listed.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add trucks first, then list them here.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {listed.map((truck) => (
                  <Label
                    key={truck.id}
                    className="flex items-center gap-3 rounded-md border px-3 py-2 font-normal"
                  >
                    <Checkbox
                      checked={selected.has(truck.id)}
                      onCheckedChange={() => toggle(truck.id)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {truck.unit_number}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {truck.vin ?? "No VIN on file"}
                        {truck.status !== "active" &&
                          ` · ${TRUCK_STATUS_LABELS[truck.status]}`}
                      </span>
                    </span>
                  </Label>
                ))}
              </div>
            )}
            {missingVin.length > 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                The 2290 lists trucks by VIN. Add a VIN for{" "}
                {missingVin.map((truck) => truck.unit_number).join(", ")}.
              </p>
            )}
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="tax-filing-notes">Notes</FieldLabel>
            <Textarea
              id="tax-filing-notes"
              name="notes"
              rows={2}
              placeholder="Schedule 1 received, suspended vehicles…"
              defaultValue={filing?.notes ?? undefined}
            />
            <FieldError
              errors={errors.notes ? [{ message: errors.notes }] : undefined}
            />
          </Field>
        </div>
        <SettingsCardFooter
          hint={
            errors.form ? (
              <span className="text-destructive">{errors.form}</span>
            ) : (
              `${selected.size} ${selected.size === 1 ? "truck" : "trucks"} on this return.`
            )
          }
        >
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : filing ? "Save changes" : "Save 2290"}{" "}
            <CornerDownLeft />
          </Button>
        </SettingsCardFooter>
      </fieldset>
    </form>
  )
}

/**
 * Records the company's 2290 for a tax year and which trucks it covers.
 * Picking a year shows that year's return, if there is one.
 */
export function TaxFilingForm({
  organizationId,
  currentTaxYear,
  filings,
  trucks,
}: {
  organizationId: string
  currentTaxYear: number
  filings: TaxFiling[]
  trucks: FilingTruck[]
}) {
  const [taxYear, setTaxYear] = useState(currentTaxYear)
  const years = [currentTaxYear - 1, currentTaxYear, currentTaxYear + 1]
  const filing = filings.find((f) => f.tax_year === taxYear) ?? null

  return (
    <SettingsCard
      title="Record a 2290"
      description="The heavy vehicle use tax return. One a year, filed by the company, listing its trucks by VIN."
      contentClassName="px-0 pb-0"
    >
      <div className="px-6">
        <ToggleGroup
          aria-label="Tax year"
          variant="outline"
          size="sm"
          spacing={1}
          value={[String(taxYear)]}
          onValueChange={(value: string[]) => {
            if (value[0]) setTaxYear(Number(value[0]))
          }}
        >
          {years.map((year) => (
            <ToggleGroupItem key={year} value={String(year)}>
              {formatTaxYear(year)}
              {filings.some((f) => f.tax_year === year) && (
                <span className="text-muted-foreground">· Filed</span>
              )}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <FilingFields
        key={taxYear}
        organizationId={organizationId}
        taxYear={taxYear}
        filing={filing}
        trucks={trucks}
      />
    </SettingsCard>
  )
}
