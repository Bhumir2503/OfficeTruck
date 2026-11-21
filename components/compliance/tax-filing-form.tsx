"use client"

import { cn } from "cn"
import {
  CornerDownLeft,
  FileText,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  deleteTaxFiling,
  saveTaxFiling,
} from "@/app/org/[slug]/compliance/actions"
import { DateField } from "@/components/drivers/date-field"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { FILE_TYPES, driverFileError } from "@/lib/driver-document-upload"
import { formatDate } from "@/lib/driver-format"
import { TRUCK_STATUS_LABELS, taxFilingSchema } from "@/lib/schemas/truck"
import { removeTruckFile, uploadTruckFile } from "@/lib/truck-document-upload"
import { formatTaxYear, owes2290, taxYearDueDate } from "@/lib/truck-format"
import type { TaxFiling, Truck } from "@/lib/trucks"

type FilingTruck = Pick<
  Truck,
  "id" | "unit_number" | "vin" | "status" | "registered_weight_lbs"
>

const NEW = "new"

/** The errors without one field's, once it's been fixed. */
function without(errors: Record<string, string>, key: string) {
  const next = { ...errors }
  delete next[key]
  return next
}

const plural = (count: number, word: string) =>
  `${count} ${count === 1 ? word : `${word}s`}`

/** "Filed Aug 12, 2026 · 3 trucks" */
const returnLabel = (filing: TaxFiling) =>
  `Filed ${formatDate(filing.filed_on)} · ${plural(filing.truck_ids.length, "truck")}`

/** The fields for one return, reset whenever the year or return changes. */
function FilingFields({
  organizationId,
  taxYear,
  filing,
  others,
  trucks,
  onSaved,
}: {
  organizationId: string
  taxYear: number
  /** Opens the return just saved, so a new one isn't saved twice. */
  onSaved: (id: string) => void
  /** The return being edited, or null for a new one. */
  filing: TaxFiling | null
  /** This year's other returns, to say which trucks they already cover. */
  others: TaxFiling[]
  trucks: FilingTruck[]
}) {
  // Which other return already lists each truck this year.
  const coveredBy = new Map<string, TaxFiling>()
  for (const other of others) {
    for (const id of other.truck_ids) coveredBy.set(id, other)
  }
  // A new return starts with every active truck that owes it and isn't on
  // another of this year's returns: the yearly one, or the ones added since.
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        filing?.truck_ids ??
          trucks
            .filter(
              (truck) =>
                truck.status === "active" &&
                owes2290(truck) &&
                !coveredBy.has(truck.id)
            )
            .map((t) => t.id)
      )
  )
  const [schedule1, setSchedule1] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  function pickSchedule1(file: File | null | undefined) {
    if (!file) return
    const problem = driverFileError(file)
    if (problem) {
      setErrors((current) => ({ ...current, schedule1: problem }))
      return
    }
    setErrors((current) => without(current, "schedule1"))
    setSchedule1(file)
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
    // Upload the Schedule 1 first, so the return points at a real file.
    let uploaded = undefined
    if (schedule1) {
      const result = await uploadTruckFile(
        organizationId,
        "2290",
        "schedule1",
        schedule1
      )
      if ("error" in result) {
        setPending(false)
        setErrors({ schedule1: result.error })
        return
      }
      uploaded = result
    }
    const result = await saveTaxFiling(
      organizationId,
      parsed.data,
      filing?.id ?? null,
      uploaded
    )
    setPending(false)
    if ("error" in result) {
      if (uploaded) await removeTruckFile(uploaded.path)
      setErrors({ form: result.error })
    } else {
      setSchedule1(null)
      onSaved(result.id)
      toast.success(
        filing
          ? `2290 for ${formatTaxYear(taxYear)} saved.`
          : `New 2290 for ${formatTaxYear(taxYear)} recorded.`
      )
    }
  }

  async function remove() {
    if (!filing) return
    setPending(true)
    const result = await deleteTaxFiling(organizationId, filing.id)
    setPending(false)
    setDeleting(false)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success("Return deleted.")
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
            hint={
              filing || !others.length
                ? `Due by ${formatDate(taxYearDueDate(taxYear))}.`
                : "Due by the end of the month after the truck's first month on the road."
            }
            defaultValue={filing?.filed_on}
            errors={
              errors.filed_on ? [{ message: errors.filed_on }] : undefined
            }
            onUpdate={() =>
              setErrors((current) => without(current, "filed_on"))
            }
          />
          {/* The stamped Schedule 1: one document listing every VIN on
              this return. A drop zone that's also the file picker. */}
          <Field>
            <FieldLabel htmlFor="tax-filing-schedule1">Schedule 1</FieldLabel>
            <label
              htmlFor="tax-filing-schedule1"
              className={cn(
                "flex h-9 cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 text-sm transition-colors hover:bg-muted/50",
                dragging && "border-primary bg-muted/50"
              )}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                pickSchedule1(event.dataTransfer.files[0])
              }}
            >
              <input
                id="tax-filing-schedule1"
                type="file"
                className="sr-only"
                accept={FILE_TYPES.join(",")}
                onChange={(event) => pickSchedule1(event.target.files?.[0])}
              />
              {schedule1 ? (
                <>
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {schedule1.name}
                  </span>
                </>
              ) : (
                <>
                  <Upload className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {filing?.schedule1
                      ? "Drop a new one to replace it"
                      : "Drop the stamped Schedule 1 here"}
                  </span>
                </>
              )}
            </label>
            {errors.schedule1 ? (
              <FieldError errors={[{ message: errors.schedule1 }]} />
            ) : (
              filing?.schedule1?.url &&
              !schedule1 && (
                <a
                  href={filing.schedule1.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:underline"
                >
                  <Paperclip className="size-3.5" />
                  {filing.schedule1.name}
                </a>
              )
            )}
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel>Trucks on this return</FieldLabel>
            {listed.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add trucks first, then list them here.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {listed.map((truck) => {
                  const other = coveredBy.get(truck.id)
                  return (
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
                          {other
                            ? `On the return filed ${formatDate(other.filed_on)}`
                            : (truck.vin ?? "No VIN on file")}
                          {truck.status !== "active" &&
                            ` · ${TRUCK_STATUS_LABELS[truck.status]}`}
                        </span>
                      </span>
                    </Label>
                  )
                })}
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
              placeholder="Suspended vehicles, amendments…"
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
              `${plural(selected.size, "truck")} on this return.`
            )
          }
        >
          {filing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="hover:text-destructive"
              onClick={() => setDeleting(true)}
            >
              <Trash2 />
              Delete
            </Button>
          )}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : filing ? "Save changes" : "Save 2290"}{" "}
            <CornerDownLeft />
          </Button>
        </SettingsCardFooter>
      </fieldset>
      <Dialog
        open={deleting}
        onOpenChange={(open) => !pending && setDeleting(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this return?</DialogTitle>
            <DialogDescription>
              {filing
                ? `The ${formatTaxYear(taxYear)} return filed ${formatDate(filing.filed_on)}${filing.schedule1 ? ", and its Schedule 1," : ""} will be deleted. Its trucks will show as not covered unless another return lists them. This can't be undone.`
                : "This can't be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setDeleting(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={remove}>
              {pending ? "Deleting…" : "Delete return"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}

/**
 * Records the company's 2290 returns: pick a tax year, then one of its
 * returns to edit, or a new one. The yearly return covers the trucks on
 * the road in July; each truck added later goes on a return of its own.
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
  const ofYear = filings.filter((f) => f.tax_year === taxYear)
  // Which return is open: one of this year's, or a new one. A year with
  // nothing filed starts on a new return.
  const [picked, setPicked] = useState<string>(
    () => filings.find((f) => f.tax_year === currentTaxYear)?.id ?? NEW
  )
  // A return that's gone (just deleted) falls back to the year's first
  // remaining one, rather than to a new return.
  const filing =
    ofYear.find((f) => f.id === picked) ??
    (picked === NEW ? null : (ofYear[0] ?? null))
  const returnId = filing ? filing.id : NEW

  const options = [
    ...ofYear.map((f) => ({ value: f.id, label: returnLabel(f) })),
    { value: NEW, label: "New return" },
  ]

  return (
    <SettingsCard
      title="Record a 2290"
      description="The heavy vehicle use tax return, filed by the company and listing its trucks by VIN. One each summer, plus another for any truck put on the road later in the year."
      contentClassName="px-0 pb-0"
    >
      <div className="flex flex-col gap-3 px-6 sm:flex-row sm:items-center sm:justify-between">
        <ToggleGroup
          aria-label="Tax year"
          variant="outline"
          size="sm"
          spacing={1}
          value={[String(taxYear)]}
          onValueChange={(value: string[]) => {
            if (!value[0]) return
            const year = Number(value[0])
            setTaxYear(year)
            setPicked(filings.find((f) => f.tax_year === year)?.id ?? NEW)
          }}
        >
          {years.map((year) => {
            const count = filings.filter((f) => f.tax_year === year).length
            return (
              <ToggleGroupItem key={year} value={String(year)}>
                {formatTaxYear(year)}
                {count > 0 && (
                  <span className="text-muted-foreground">
                    · {count === 1 ? "Filed" : `${count} filed`}
                  </span>
                )}
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
        {ofYear.length > 0 && (
          <Select
            value={returnId}
            onValueChange={(value) => setPicked((value as string) ?? NEW)}
            items={options}
          >
            <SelectTrigger
              aria-label="Return"
              className="w-full shrink-0 sm:w-64"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <FilingFields
        key={`${taxYear}-${returnId}`}
        organizationId={organizationId}
        taxYear={taxYear}
        filing={filing}
        others={ofYear.filter((f) => f.id !== returnId)}
        trucks={trucks}
        onSaved={setPicked}
      />
    </SettingsCard>
  )
}
