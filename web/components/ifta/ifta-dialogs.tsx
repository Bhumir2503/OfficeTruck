"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  addFuelPurchase,
  markIftaFiled,
  setStateMiles,
  type ActionResult,
} from "@/app/org/[slug]/ifta/actions"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  IFTA_JURISDICTIONS,
  JURISDICTION_NAMES,
  quarterLabel,
  quarterRange,
  type Quarter,
} from "@/lib/ifta-format"
import { fuelPurchaseSchema, stateMilesSchema } from "@/lib/schemas/ifta"

export type TruckOption = { id: string; name: string }

const JURISDICTION_ITEMS = IFTA_JURISDICTIONS.map((code) => ({
  value: code,
  label: `${code} · ${JURISDICTION_NAMES[code]}`,
}))

function TruckSelect({
  id,
  trucks,
  value,
  onChange,
}: {
  id: string
  trucks: TruckOption[]
  value: string
  onChange: (value: string) => void
}) {
  const items = trucks.map((truck) => ({ value: truck.id, label: truck.name }))
  return (
    <Select
      value={value || null}
      onValueChange={(next) => onChange((next as string | null) ?? "")}
      items={items}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Choose a truck" />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function JurisdictionSelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Select
      value={value || null}
      onValueChange={(next) => onChange((next as string | null) ?? "")}
      items={JURISDICTION_ITEMS}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Choose a state" />
      </SelectTrigger>
      <SelectContent>
        {JURISDICTION_ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** The dialog frame every entry form here shares. */
function EntryDialog({
  formId,
  title,
  description,
  submitLabel,
  open,
  onOpenChange,
  pending,
  error,
  onSubmit,
  children,
}: {
  formId: string
  title: string
  description: string
  submitLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  error: string | null
  onSubmit: (data: Record<string, FormDataEntryValue>) => void
  children: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(Object.fromEntries(new FormData(event.currentTarget)))
          }}
        >
          {children}
          {error && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Runs a save, showing its error in the form or closing on success. */
function useSave(onDone: () => void) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  function save(run: () => Promise<ActionResult>, success: string) {
    start(async () => {
      const result = await run()
      if ("error" in result) {
        setError(result.error)
        return
      }
      toast.success(success)
      onDone()
    })
  }
  return { error, setError, pending, save }
}

export function AddMilesDialog({
  organizationId,
  quarter,
  trucks,
  truckId,
  onTruckChange,
  open,
  onOpenChange,
}: {
  organizationId: string
  quarter: Quarter
  trucks: TruckOption[]
  /** Kept by the page, so several states in a row go to the same truck. */
  truckId: string
  onTruckChange: (id: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [jurisdiction, setJurisdiction] = useState("")
  const { error, setError, pending, save } = useSave(() => onOpenChange(false))

  return (
    <EntryDialog
      formId="ifta-miles-form"
      title="Add miles by state"
      description={`Miles one truck drove in one state in ${quarterLabel(quarter, true)}, from trip sheets or the ELD. Entering a state again replaces its miles.`}
      submitLabel="Save miles"
      open={open}
      onOpenChange={onOpenChange}
      pending={pending}
      error={error}
      onSubmit={(data) => {
        const parsed = stateMilesSchema.safeParse({
          ...data,
          ...quarter,
          truck_id: truckId,
          jurisdiction,
        })
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the entry.")
          return
        }
        save(
          () => setStateMiles(organizationId, parsed.data),
          `${parsed.data.jurisdiction} miles saved.`
        )
      }}
    >
      <Field>
        <FieldLabel htmlFor="ifta-miles-truck">Truck</FieldLabel>
        <TruckSelect
          id="ifta-miles-truck"
          trucks={trucks}
          value={truckId}
          onChange={onTruckChange}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="ifta-miles-state">State or province</FieldLabel>
        <JurisdictionSelect
          id="ifta-miles-state"
          value={jurisdiction}
          onChange={setJurisdiction}
        />
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor="ifta-miles-miles">Miles</FieldLabel>
        <Input
          id="ifta-miles-miles"
          name="miles"
          inputMode="numeric"
          placeholder="e.g. 1,240"
          autoComplete="off"
        />
      </Field>
    </EntryDialog>
  )
}

export function AddFuelDialog({
  organizationId,
  quarter,
  today,
  trucks,
  truckId,
  onTruckChange,
  open,
  onOpenChange,
}: {
  organizationId: string
  quarter: Quarter
  today: string
  trucks: TruckOption[]
  truckId: string
  onTruckChange: (id: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { start, end } = quarterRange(quarter)
  const latest = end < today ? end : today
  const [purchasedOn, setPurchasedOn] = useState(latest)
  const [jurisdiction, setJurisdiction] = useState("")
  const { error, setError, pending, save } = useSave(() => onOpenChange(false))

  return (
    <EntryDialog
      formId="ifta-fuel-form"
      title="Add a fuel purchase"
      description="Diesel bought for a truck, from the receipt or fuel card statement. The state is where it was bought."
      submitLabel="Save purchase"
      open={open}
      onOpenChange={onOpenChange}
      pending={pending}
      error={error}
      onSubmit={(data) => {
        const parsed = fuelPurchaseSchema.safeParse({
          ...data,
          truck_id: truckId,
          purchased_on: purchasedOn,
          jurisdiction,
        })
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the entry.")
          return
        }
        save(
          () => addFuelPurchase(organizationId, parsed.data),
          "Fuel purchase saved."
        )
      }}
    >
      <Field>
        <FieldLabel htmlFor="ifta-fuel-date">Date</FieldLabel>
        <DatePicker
          id="ifta-fuel-date"
          required
          min={start}
          max={latest}
          value={purchasedOn}
          onChange={setPurchasedOn}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="ifta-fuel-truck">Truck</FieldLabel>
        <TruckSelect
          id="ifta-fuel-truck"
          trucks={trucks}
          value={truckId}
          onChange={onTruckChange}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="ifta-fuel-state">State or province</FieldLabel>
        <JurisdictionSelect
          id="ifta-fuel-state"
          value={jurisdiction}
          onChange={setJurisdiction}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="ifta-fuel-gallons">Gallons</FieldLabel>
        <Input
          id="ifta-fuel-gallons"
          name="gallons"
          inputMode="decimal"
          placeholder="e.g. 112.5"
          autoComplete="off"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="ifta-fuel-amount">Amount (optional)</FieldLabel>
        <Input
          id="ifta-fuel-amount"
          name="amount"
          inputMode="decimal"
          placeholder="$0.00"
          autoComplete="off"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="ifta-fuel-vendor">Where (optional)</FieldLabel>
        <Input
          id="ifta-fuel-vendor"
          name="vendor"
          maxLength={120}
          placeholder="e.g. Pilot, Amarillo"
        />
      </Field>
    </EntryDialog>
  )
}

export function MarkFiledDialog({
  organizationId,
  quarter,
  today,
  open,
  onOpenChange,
}: {
  organizationId: string
  quarter: Quarter
  today: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [filedOn, setFiledOn] = useState(today)
  const { error, pending, save } = useSave(() => onOpenChange(false))

  return (
    <EntryDialog
      formId="ifta-filed-form"
      title={`Mark ${quarterLabel(quarter)} as filed`}
      description="Once the return is filed with your base state. The dashboard stops reminding you about it."
      submitLabel="Mark as filed"
      open={open}
      onOpenChange={onOpenChange}
      pending={pending}
      error={error}
      onSubmit={() =>
        save(
          () =>
            markIftaFiled(organizationId, { ...quarter, filed_on: filedOn }),
          `${quarterLabel(quarter)} marked as filed.`
        )
      }
    >
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor="ifta-filed-on">Filed on</FieldLabel>
        <DatePicker
          id="ifta-filed-on"
          required
          max={today}
          value={filedOn}
          onChange={setFiledOn}
        />
      </Field>
    </EntryDialog>
  )
}
