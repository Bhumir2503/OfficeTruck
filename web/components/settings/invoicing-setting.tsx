"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"

/**
 * Invoicing on its own: the invoice made and emailed once a delivered
 * load's paperwork is in, and reminders on unpaid invoices.
 */
export function InvoicingSetting({
  organizationId,
  invoice,
  reminders,
  canEdit,
}: {
  organizationId: string
  invoice: boolean
  reminders: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const [autoInvoice, setAutoInvoice] = useState(invoice)
  const [remind, setRemind] = useState(reminders)
  const [pending, start] = useTransition()
  const changed = autoInvoice !== invoice || remind !== reminders

  function save() {
    start(async () => {
      const { data, error } = await createClient()
        .from("organizations")
        .update({ auto_invoice: autoInvoice, auto_invoice_reminders: remind })
        .eq("id", organizationId)
        .select("id")
      if (error || !data.length) {
        toast.error(error?.message ?? "Only owners and admins can change this.")
        return
      }
      toast.success("Invoicing settings saved.")
      router.refresh()
    })
  }

  return (
    <SettingsCard
      title="Invoicing"
      description="Bill loads as soon as the paperwork is in, and chase what's unpaid, without anyone remembering to."
      footer={
        <SettingsCardFooter
          hint={
            canEdit
              ? "Customers can be switched on or off one by one on their page."
              : "Only owners and admins can change this."
          }
        >
          {canEdit && (
            <Button size="sm" disabled={pending || !changed} onClick={save}>
              {pending ? "Saving…" : "Save"}
            </Button>
          )}
        </SettingsCardFooter>
      }
      contentClassName="flex flex-col gap-4"
    >
      <Label className="flex items-start gap-3 font-normal">
        <Checkbox
          className="mt-0.5"
          checked={autoInvoice}
          disabled={!canEdit}
          onCheckedChange={(checked) => setAutoInvoice(checked === true)}
        />
        <span>
          Invoice delivered loads automatically
          <span className="block text-sm text-muted-foreground">
            Once the rate con, BOL and POD are in, the invoice is made and the
            packet emailed to the broker, or to your factoring company for
            factored loads. Customers with a portal get a draft to upload. Only
            loads delivered after you turn this on.
          </span>
        </span>
      </Label>
      <Label className="flex items-start gap-3 font-normal">
        <Checkbox
          className="mt-0.5"
          checked={remind}
          disabled={!canEdit}
          onCheckedChange={(checked) => setRemind(checked === true)}
        />
        <span>
          Remind customers about unpaid invoices
          <span className="block text-sm text-muted-foreground">
            The packet again, the day after it&apos;s due and then weekly, three
            times at most. Factored invoices are left to your factoring company.
          </span>
        </span>
      </Label>
    </SettingsCard>
  )
}
