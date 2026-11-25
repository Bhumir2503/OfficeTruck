"use client"

import { useState } from "react"
import { toast } from "sonner"

import { setLoadDriverPay } from "@/app/org/[slug]/loads/actions"
import {
  formatRate as formatRateInput,
  handleRateInput,
  PAY_UNITS,
} from "@/components/drivers/pay-fields"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { useZodForm } from "@/hooks/use-zod-form"
import { driverPay, formatPay } from "@/lib/driver-format"
import { formatRate } from "@/lib/load-format"
import type { Load } from "@/lib/loads"
import { PAY_TYPES, PAY_TYPE_LABELS, type PayType } from "@/lib/schemas/driver"
import { loadDriverPaySchema } from "@/lib/schemas/load"

// Lives inside the dialog content so its state resets each time it opens.
function PayForm({
  organizationId,
  load,
  usual,
  onDone,
}: {
  organizationId: string
  load: Load
  /** The driver's usual rate, to go back to. */
  usual: { pay_type: PayType | null; pay_rate: number | null }
  onDone: () => void
}) {
  const [type, setType] = useState<PayType>(
    load.driver_pay_type ?? usual.pay_type ?? "flat"
  )
  // The rate box, kept here so "Use their usual rate" can fill it.
  const [rate, setRate] = useState(() =>
    type === load.driver_pay_type && load.driver_pay_rate !== null
      ? formatRateInput(String(Number(load.driver_pay_rate)))
      : ""
  )
  const { errors, formError, pending, formProps } = useZodForm(
    loadDriverPaySchema,
    async (values) => {
      const result = await setLoadDriverPay(organizationId, load.id, values)
      if ("error" in result) {
        return result.error
      }
      toast.success(`Pay on load ${load.reference} updated.`)
      onDone()
    }
  )

  const unit = PAY_UNITS[type]
  const amount = Number(rate.replace(/,/g, ""))
  const preview =
    rate === ""
      ? null
      : driverPay(
          { pay_type: type, pay_rate: amount },
          { rate: Number(load.rate), miles: load.miles }
        )
  const usualText = formatPay(usual.pay_type, usual.pay_rate)
  // Same as the load's pay now: nothing to save.
  const unchanged =
    type === load.driver_pay_type &&
    load.driver_pay_rate !== null &&
    rate !== "" &&
    Number(load.driver_pay_rate) === amount
  const isUsual =
    usual.pay_type === type &&
    usual.pay_rate !== null &&
    Number(usual.pay_rate) === amount

  return (
    <form {...formProps} autoComplete="off">
      <fieldset disabled={pending} className="flex flex-col gap-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!errors.pay_type}>
            <FieldLabel id="load-pay-type-label">Paid</FieldLabel>
            <input type="hidden" name="pay_type" value={type} />
            <Select
              value={type}
              onValueChange={(value) => {
                if (!value) return
                setType(value as PayType)
                setRate("")
              }}
              items={PAY_TYPES.map((payType) => ({
                value: payType,
                label: PAY_TYPE_LABELS[payType],
              }))}
            >
              <SelectTrigger
                aria-labelledby="load-pay-type-label"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAY_TYPES.map((payType) => (
                  <SelectItem key={payType} value={payType}>
                    {PAY_TYPE_LABELS[payType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={errors.pay_type} />
          </Field>
          <Field data-invalid={!!errors.pay_rate}>
            <FieldLabel htmlFor="load-pay-rate">Rate</FieldLabel>
            <div className="relative">
              {unit.prefix && (
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                  {unit.prefix}
                </span>
              )}
              <Input
                id="load-pay-rate"
                name="pay_rate"
                inputMode="decimal"
                autoFocus
                placeholder={
                  type === "per_mile"
                    ? "0.65"
                    : type === "percent"
                      ? "25"
                      : "500"
                }
                value={rate}
                aria-invalid={!!errors.pay_rate}
                className={unit.prefix ? "pr-20 pl-6" : "pr-24"}
                onChange={(event) => {
                  handleRateInput(event)
                  setRate(event.currentTarget.value)
                }}
              />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                {unit.suffix}
              </span>
            </div>
            <FieldError errors={errors.pay_rate} />
          </Field>
        </div>
        <FieldDescription>
          {preview !== null
            ? `${formatRate(preview)} for this load.`
            : type === "per_mile" && rate !== "" && !load.miles
              ? "Add the load's miles to work out the pay."
              : "Enter the rate for this load."}{" "}
          {usualText && !isUsual && (
            <>
              Their usual rate is {usualText}.{" "}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-2"
                onClick={() => {
                  if (!usual.pay_type || usual.pay_rate === null) return
                  setType(usual.pay_type)
                  setRate(formatRateInput(String(Number(usual.pay_rate))))
                }}
              >
                Use it
              </button>
            </>
          )}
        </FieldDescription>
        <DialogFooter className="items-center">
          {formError && (
            <p className="mr-auto text-sm text-destructive">{formError}</p>
          )}
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || unchanged}>
            {pending ? "Saving…" : "Save pay"}
          </Button>
        </DialogFooter>
      </fieldset>
    </form>
  )
}

/** Sets the driver's pay on one load, in place of their usual rate. */
export function LoadPayDialog({
  organizationId,
  load,
  usual,
  open,
  onOpenChange,
}: {
  organizationId: string
  load: Load
  usual: { pay_type: PayType | null; pay_rate: number | null }
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pay for load {load.reference}</DialogTitle>
          <DialogDescription>
            What {load.driver?.full_name ?? "the driver"} earns on this load
            only. Their pay on other loads doesn&apos;t change.
          </DialogDescription>
        </DialogHeader>
        <PayForm
          organizationId={organizationId}
          load={load}
          usual={usual}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
