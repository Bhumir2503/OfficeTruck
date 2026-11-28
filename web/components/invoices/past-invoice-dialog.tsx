"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { recordPastInvoice } from "@/app/org/[slug]/invoices/actions"
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const VIA = [
  { value: "email", label: "Emailed" },
  { value: "portal", label: "Uploaded to their portal" },
  { value: "other", label: "Another way (mail, fax…)" },
] as const

type Via = (typeof VIA)[number]["value"]

/**
 * Records a draft as sent on an earlier day: for invoices that went out
 * before the company used OfficeTruck. Nothing is sent.
 */
export function PastInvoiceDialog({
  organizationId,
  invoiceId,
  number,
  today,
  earliest,
  open,
  onOpenChange,
}: {
  organizationId: string
  invoiceId: string
  number: number
  /** "YYYY-MM-DD" */
  today: string
  /** The day the load was delivered: it can't have been billed before. */
  earliest: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [sentOn, setSentOn] = useState("")
  const [via, setVia] = useState<Via>("email")
  const [numberText, setNumberText] = useState(String(number))
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    if (!sentOn) {
      setError("Enter the day it was sent.")
      return
    }
    setError(null)
    start(async () => {
      const changed = numberText.replace(/[,\s#]/g, "") !== String(number)
      const result = await recordPastInvoice(organizationId, invoiceId, {
        via,
        sent_on: sentOn,
        number: changed ? numberText : undefined,
      })
      if ("error" in result) {
        setError(result.error)
        return
      }
      toast.success(
        `Invoice ${changed ? numberText.replace(/[,\s#]/g, "") : number} recorded as sent.`
      )
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record invoice {number} as sent earlier</DialogTitle>
          <DialogDescription>
            For an invoice that went out before you used OfficeTruck. Nothing is
            emailed: it&apos;s dated the day you pick, and it&apos;s due from
            there. Record any payment next.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="past-invoice-sent-on">Sent on</FieldLabel>
            <DatePicker
              id="past-invoice-sent-on"
              required
              value={sentOn}
              onChange={setSentOn}
              min={earliest ?? undefined}
              max={today}
              invalid={!!error}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="past-invoice-number">
              Invoice number
            </FieldLabel>
            <Input
              id="past-invoice-number"
              inputMode="numeric"
              value={numberText}
              onChange={(event) => setNumberText(event.target.value)}
            />
            <FieldDescription>
              The number it went out with, if it had one before.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="past-invoice-via">How</FieldLabel>
            <Select
              value={via}
              onValueChange={(value) => value && setVia(value as Via)}
              items={[...VIA]}
            >
              <SelectTrigger id="past-invoice-via" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIA.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Record as sent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
