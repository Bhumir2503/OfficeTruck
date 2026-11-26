"use client"

import { CornerDownLeft } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { updateLoadDetails } from "@/app/org/[slug]/loads/actions"
import { FreightFields, LoadTextField } from "@/components/loads/freight-fields"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useZodForm } from "@/hooks/use-zod-form"
import type { Load } from "@/lib/loads"
import { loadDetailsSchema } from "@/lib/schemas/load"

/** The form's values as text, to tell whether anything changed. */
function snapshot(form: HTMLFormElement | null) {
  const values = new Map<string, string>()
  if (form) {
    for (const [name, value] of new FormData(form)) {
      values.set(name, typeof value === "string" ? value : value.name)
    }
  }
  return values
}

function differs(a: Map<string, string>, b: Map<string, string>) {
  for (const name of new Set([...a.keys(), ...b.keys()])) {
    if (a.get(name) !== b.get(name)) return true
  }
  return false
}

/**
 * The load number and what's being hauled, edited in place like the truck
 * and driver pages: Save turns on once something changes, and Enter saves.
 */
function DetailsForm({
  organizationId,
  load,
  notice,
}: {
  organizationId: string
  load: Load
  notice?: React.ReactNode
}) {
  const formRef = useRef<HTMLFormElement>(null)
  // What's saved, read from the form once it's drawn.
  const baseline = useRef<Map<string, string> | null>(null)
  const [dirty, setDirty] = useState(false)

  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    loadDetailsSchema,
    async (values) => {
      const result = await updateLoadDetails(organizationId, load.id, values)
      if ("error" in result) {
        return result.error
      }
      baseline.current = snapshot(formRef.current)
      setDirty(false)
      toast.success(`Load ${values.reference} saved.`)
    }
  )

  function checkDirty() {
    const form = formRef.current
    if (!form) return
    baseline.current ??= snapshot(form)
    setDirty(differs(baseline.current, snapshot(form)))
  }

  return (
    <form
      {...formProps}
      ref={(form) => {
        formRef.current = form
        if (form && !baseline.current) baseline.current = snapshot(form)
      }}
      autoComplete="off"
      onChange={(event) => {
        formProps.onChange(event)
        checkDirty()
      }}
    >
      <SettingsCard
        title="Load details"
        description="The load number and what's being hauled."
        footer={
          <SettingsCardFooter
            hint={
              formError && <span className="text-destructive">{formError}</span>
            }
          >
            <Button type="submit" size="sm" disabled={pending || !dirty}>
              {pending ? "Saving…" : "Save"} <CornerDownLeft />
            </Button>
          </SettingsCardFooter>
        }
      >
        {notice}
        <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-6">
          <LoadTextField
            name="reference"
            label="Load number"
            defaultValue={load.reference}
            errors={errors}
            className="sm:col-span-6"
          />
          <FreightFields
            defaults={load}
            errors={errors}
            onUpdate={(form) => {
              revalidate(form)
              checkDirty()
            }}
          />
          <Field data-invalid={!!errors.notes} className="sm:col-span-6">
            <FieldLabel htmlFor="load-notes">Notes</FieldLabel>
            <Textarea
              id="load-notes"
              name="notes"
              rows={3}
              defaultValue={load.notes ?? ""}
              aria-invalid={!!errors.notes}
            />
            <FieldError errors={errors.notes} />
          </Field>
        </fieldset>
      </SettingsCard>
    </form>
  )
}

/**
 * The load's details at the top of the load page, editable in place. The
 * load number, broker and status are in the page header above it.
 */
export function LoadDetailsCard({
  organizationId,
  load,
  notice,
}: {
  organizationId: string
  load: Load
  /** Above the fields, e.g. why the load was canceled. */
  notice?: React.ReactNode
}) {
  // Saved values that change elsewhere (another tab, a teammate) start the
  // form over from them.
  const saved = JSON.stringify([
    load.reference,
    load.reference_numbers,
    load.equipment,
    load.commodity,
    load.weight_lbs,
    load.trailer_number,
    load.notes,
  ])
  return (
    <DetailsForm
      key={saved}
      organizationId={organizationId}
      load={load}
      notice={notice}
    />
  )
}
