"use client"

import { Pencil } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { updateLoadDetails } from "@/app/org/[slug]/loads/actions"
import { FreightFields, LoadTextField } from "@/components/loads/freight-fields"
import { SettingsCard } from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useZodForm } from "@/hooks/use-zod-form"
import type { Load } from "@/lib/loads"
import { EQUIPMENT_LABELS, loadDetailsSchema } from "@/lib/schemas/load"

function Detail({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium whitespace-pre-wrap">
        {children}
      </dd>
    </div>
  )
}

// Lives inside the dialog content so its state resets each time it opens.
function DetailsForm({
  organizationId,
  load,
  onDone,
}: {
  organizationId: string
  load: Load
  onDone: () => void
}) {
  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    loadDetailsSchema,
    async (values) => {
      const result = await updateLoadDetails(organizationId, load.id, values)
      if ("error" in result) {
        return result.error
      }
      toast.success(`Load ${values.reference} updated.`)
      onDone()
    }
  )

  return (
    <form {...formProps} autoComplete="off">
      <fieldset disabled={pending} className="flex flex-col gap-6">
        <div className="grid gap-5 sm:grid-cols-6">
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
            onUpdate={revalidate}
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
        </div>
        <DialogFooter className="items-center">
          {formError && (
            <p className="mr-auto text-sm text-destructive">{formError}</p>
          )}
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </fieldset>
    </form>
  )
}

/** What's being hauled, with a dialog to change it. */
export function LoadDetailsCard({
  organizationId,
  load,
}: {
  organizationId: string
  load: Load
}) {
  const [open, setOpen] = useState(false)
  const none = (
    <span className="font-normal text-muted-foreground">Not set</span>
  )

  return (
    <SettingsCard
      title="Freight"
      description="What's being hauled, from the rate con."
      action={
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Pencil />
          Edit
        </Button>
      }
    >
      <dl className="grid gap-5 sm:grid-cols-4">
        <Detail label="Equipment">
          {load.equipment ? EQUIPMENT_LABELS[load.equipment] : none}
        </Detail>
        <Detail label="Commodity">{load.commodity ?? none}</Detail>
        <Detail label="Weight">
          {load.weight_lbs !== null
            ? `${load.weight_lbs.toLocaleString("en-US")} lbs`
            : none}
        </Detail>
        <Detail label="Trailer">{load.trailer_number ?? none}</Detail>
        <Detail label="Reference numbers" className="sm:col-span-4">
          {load.reference_numbers ?? none}
        </Detail>
        <Detail label="Notes" className="sm:col-span-4">
          {load.notes ?? none}
        </Detail>
      </dl>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit load {load.reference}</DialogTitle>
            <DialogDescription>
              The load number and what&apos;s being hauled.
            </DialogDescription>
          </DialogHeader>
          <DetailsForm
            organizationId={organizationId}
            load={load}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </SettingsCard>
  )
}
