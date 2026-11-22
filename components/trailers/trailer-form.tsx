"use client"

import { CornerDownLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { createTrailer, updateTrailer } from "@/app/org/[slug]/trailers/actions"
import { DateField } from "@/components/drivers/date-field"
import { TruckSelect } from "@/components/loads/truck-select"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import {
  handleStateInput,
  handleYearInput,
  OwnershipField,
  upperAlnum,
} from "@/components/trucks/truck-form"
import { AddRecordPanel } from "@/components/add-record-panel"
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
import { Textarea } from "@/components/ui/textarea"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  TRAILER_TYPES,
  TRAILER_TYPE_LABELS,
  trailerSchema,
  type TrailerInput,
  type TrailerType,
} from "@/lib/schemas/trailer"
import type { Trailer } from "@/lib/trailers"
import type { TruckOption } from "@/lib/trucks"

type Name = keyof TrailerInput
type Errors = Partial<Record<Name, { message: string }[]>>

/** The form's cards, for the Add trailer panel's links. */
const CARD_IDS = {
  details: "trailer-card",
  plate: "plate-card",
  ownership: "ownership-card",
  notes: "notes-card",
}

const fieldId = (name: Name) => `trailer-${name.replaceAll("_", "-")}`

function TextField({
  name,
  label,
  errors,
  hint,
  className,
  ...input
}: {
  name: Name
  label: string
  errors: Errors
  hint?: string
  className?: string
} & Omit<React.ComponentProps<"input">, "name" | "className">) {
  const id = fieldId(name)
  const fieldErrors = errors[name]
  return (
    <Field data-invalid={!!fieldErrors} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} aria-invalid={!!fieldErrors} {...input} />
      {fieldErrors ? (
        <FieldError errors={fieldErrors} />
      ) : (
        hint && <FieldDescription>{hint}</FieldDescription>
      )}
    </Field>
  )
}

/** Dry van, reefer and so on, filling a hidden `trailer_type` input. */
function TypeField({
  defaultValue,
  errors,
}: {
  defaultValue: TrailerType | null
  errors?: { message: string }[]
}) {
  const [value, setValue] = useState<TrailerType | "">(defaultValue ?? "")
  const items = [
    { value: "none", label: "Not set" },
    ...TRAILER_TYPES.map((type) => ({
      value: type,
      label: TRAILER_TYPE_LABELS[type],
    })),
  ]
  return (
    <Field data-invalid={!!errors} className="sm:col-span-2">
      <FieldLabel htmlFor="trailer-type">Type</FieldLabel>
      <input type="hidden" name="trailer_type" value={value} />
      <Select
        value={value || "none"}
        onValueChange={(next) =>
          setValue(!next || next === "none" ? "" : (next as TrailerType))
        }
        items={items}
      >
        <SelectTrigger id="trailer-type" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.value === "none" ? (
                <span className="text-muted-foreground">{item.label}</span>
              ) : (
                item.label
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError errors={errors} />
    </Field>
  )
}

/**
 * The fields for a trailer. With `trailer` it edits that trailer and stays
 * on the page; without, it adds a new one and opens it.
 */
export function TrailerForm({
  organizationId,
  base,
  trucks,
  trailer,
}: {
  organizationId: string
  /** /org/<slug>/trailers */
  base: string
  trucks: TruckOption[]
  trailer?: Trailer
}) {
  const router = useRouter()
  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    trailerSchema,
    async (values) => {
      if (trailer) {
        const result = await updateTrailer(organizationId, trailer.id, values)
        if ("error" in result) {
          return result.error
        }
        toast.success(`${values.unit_number} saved.`)
        return
      }
      const result = await createTrailer(organizationId, values)
      if ("error" in result) {
        return result.error
      }
      toast.success(`${values.unit_number} added.`)
      router.push(`${base}/${result.id}`)
    }
  )

  return (
    <form {...formProps} autoComplete="off">
      <fieldset
        disabled={pending}
        className={
          trailer
            ? "flex flex-col gap-6"
            : // Adding: the cards, with what's filled in and saving beside
              // them, as on Add truck and Add driver.
              "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]"
        }
      >
        <div
          className={
            trailer
              ? "contents"
              : "flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1"
          }
        >
          <SettingsCard
            title={trailer ? "Trailer details" : "Trailer"}
            id={CARD_IDS.details}
            className="scroll-mt-6"
            contentClassName="grid gap-5 sm:grid-cols-6"
          >
            <TextField
              name="unit_number"
              label="Unit number"
              placeholder="e.g. T-104"
              defaultValue={trailer?.unit_number}
              errors={errors}
              className="sm:col-span-2"
              autoFocus={!trailer}
            />
            <TypeField
              defaultValue={trailer?.trailer_type ?? null}
              errors={errors.trailer_type}
            />
            <TextField
              name="length_ft"
              label="Length (ft)"
              inputMode="numeric"
              placeholder="e.g. 53"
              maxLength={2}
              defaultValue={trailer?.length_ft ?? undefined}
              errors={errors}
              className="sm:col-span-2"
            />
            <TextField
              name="vin"
              label="VIN"
              placeholder="17 characters"
              defaultValue={trailer?.vin ?? undefined}
              errors={errors}
              className="sm:col-span-2"
              onChange={upperAlnum(17)}
            />
            <TextField
              name="year"
              label="Year"
              inputMode="numeric"
              placeholder="e.g. 2019"
              defaultValue={trailer?.year ?? undefined}
              errors={errors}
              className="sm:col-span-2"
              onChange={handleYearInput}
            />
            <TextField
              name="make"
              label="Make"
              placeholder="e.g. Utility"
              defaultValue={trailer?.make ?? undefined}
              errors={errors}
              className="sm:col-span-2"
            />
          </SettingsCard>

          <SettingsCard
            title="Plate and compliance"
            id={CARD_IDS.plate}
            className="scroll-mt-6"
            contentClassName="grid gap-5 sm:grid-cols-6"
          >
            <TextField
              name="plate_number"
              label="Plate number"
              placeholder="e.g. TR12345"
              defaultValue={trailer?.plate_number ?? undefined}
              errors={errors}
              className="sm:col-span-4"
              onChange={upperAlnum(15, true)}
            />
            <TextField
              name="plate_state"
              label="Plate state"
              placeholder="TX"
              autoCapitalize="characters"
              defaultValue={trailer?.plate_state ?? undefined}
              errors={errors}
              className="sm:col-span-2"
              onChange={handleStateInput}
            />
            <DateField
              id={fieldId("plate_expires_on")}
              name="plate_expires_on"
              label="Plate expires"
              defaultValue={trailer?.plate_expires_on}
              errors={errors.plate_expires_on}
              onUpdate={revalidate}
              className="sm:col-span-2"
            />
            <DateField
              id={fieldId("registration_expires_on")}
              name="registration_expires_on"
              label="Registration expires"
              defaultValue={trailer?.registration_expires_on}
              errors={errors.registration_expires_on}
              onUpdate={revalidate}
              className="sm:col-span-2"
            />
            <DateField
              id={fieldId("annual_inspection_on")}
              name="annual_inspection_on"
              label="Last annual inspection"
              defaultValue={trailer?.annual_inspection_on}
              errors={errors.annual_inspection_on}
              onUpdate={revalidate}
              className="sm:col-span-2"
            />
          </SettingsCard>

          <SettingsCard
            title="Ownership and truck"
            id={CARD_IDS.ownership}
            className="scroll-mt-6"
            contentClassName="grid gap-5 sm:grid-cols-6"
          >
            <OwnershipField
              defaultValue={trailer?.ownership ?? null}
              errors={errors.ownership}
              onUpdate={revalidate}
            />
            <Field data-invalid={!!errors.truck_id} className="sm:col-span-3">
              <FieldLabel htmlFor={fieldId("truck_id")}>Pulled by</FieldLabel>
              <TruckSelect
                id={fieldId("truck_id")}
                trucks={trucks}
                defaultValue={trailer?.truck_id}
                invalid={!!errors.truck_id}
                onUpdate={revalidate}
              />
              <FieldError errors={errors.truck_id} />
            </Field>
          </SettingsCard>

          <SettingsCard
            title="Notes"
            id={CARD_IDS.notes}
            className="scroll-mt-6"
            footer={
              // Adding saves from the panel beside the cards.
              trailer && (
                <SettingsCardFooter
                  hint={
                    formError && (
                      <span className="text-destructive">{formError}</span>
                    )
                  }
                >
                  <Button type="submit" size="sm" disabled={pending}>
                    {pending ? "Saving…" : "Save changes"} <CornerDownLeft />
                  </Button>
                </SettingsCardFooter>
              )
            }
          >
            <Field data-invalid={!!errors.notes}>
              <FieldLabel htmlFor="trailer-notes" className="sr-only">
                Notes
              </FieldLabel>
              <Textarea
                id="trailer-notes"
                name="notes"
                rows={3}
                placeholder="Door type, reefer unit, quirks…"
                defaultValue={trailer?.notes ?? undefined}
                aria-invalid={!!errors.notes}
              />
              <FieldError errors={errors.notes} />
            </Field>
          </SettingsCard>
        </div>

        {!trailer && (
          // Beside the cards, what's filled in and saving stay in view; on a
          // phone they come after them.
          <aside className="lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1">
            <AddRecordPanel
              eyebrow="New trailer"
              placeholderTitle="Add a trailer"
              nameField="unit_number"
              sections={[
                { id: CARD_IDS.details, label: "Trailer" },
                { id: CARD_IDS.plate, label: "Plate and compliance" },
                { id: CARD_IDS.ownership, label: "Ownership and truck" },
                { id: CARD_IDS.notes, label: "Notes", optional: true },
              ]}
              hint="Only the unit number is needed to save. Anything else can be added from its page later."
              submitLabel="Save trailer"
              pending={pending}
              cancelHref={base}
              formError={formError}
            />
          </aside>
        )}
      </fieldset>
    </form>
  )
}
