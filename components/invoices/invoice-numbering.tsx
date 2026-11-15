"use client"

import { useState } from "react"
import { toast } from "sonner"

import { setNextInvoiceNumber } from "@/app/org/[slug]/invoices/actions"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/** The number the next invoice gets, so numbering can pick up where an old system left off. */
export function InvoiceNumbering({
  organizationId,
  next,
  canManage,
}: {
  organizationId: string
  next: number
  canManage: boolean
}) {
  const [value, setValue] = useState(String(next))
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    const result = await setNextInvoiceNumber(organizationId, value)
    setPending(false)
    if ("error" in result) {
      setError(result.error)
    } else {
      setError(null)
      toast.success(`The next invoice will be number ${value.trim()}.`)
    }
  }

  return (
    <form onSubmit={save}>
      <SettingsCard
        title="Invoice numbering"
        description="Invoices are numbered in order. Start from where your old system left off; a number that's already used is skipped."
        footer={
          <SettingsCardFooter
            hint={
              error ? (
                <span className="text-destructive">{error}</span>
              ) : canManage ? (
                "Owners and admins can change this."
              ) : (
                "Only owners and admins can change this."
              )
            }
          >
            {canManage && (
              <Button
                type="submit"
                size="sm"
                disabled={pending || value.trim() === String(next)}
              >
                {pending ? "Saving…" : "Save"}
              </Button>
            )}
          </SettingsCardFooter>
        }
      >
        <label className="flex max-w-xs flex-col gap-2 text-sm font-medium">
          Next invoice number
          <Input
            name="next_invoice_number"
            inputMode="numeric"
            value={value}
            disabled={!canManage}
            onChange={(event) => {
              setValue(event.target.value)
              setError(null)
            }}
          />
        </label>
      </SettingsCard>
    </form>
  )
}
