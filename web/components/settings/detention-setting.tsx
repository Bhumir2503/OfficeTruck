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
 * Detention, handled as it happens: notices to the broker before and when
 * it starts (brokers pay it only when told in time), and the charge added
 * when the driver leaves past free time.
 */
export function DetentionSetting({
  organizationId,
  notices,
  autoCharge,
  canEdit,
}: {
  organizationId: string
  notices: boolean
  autoCharge: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const [notify, setNotify] = useState(notices)
  const [charge, setCharge] = useState(autoCharge)
  const [pending, start] = useTransition()
  const changed = notify !== notices || charge !== autoCharge

  function save() {
    start(async () => {
      const { data, error } = await createClient()
        .from("organizations")
        .update({ detention_notices: notify, detention_auto_charge: charge })
        .eq("id", organizationId)
        .select("id")
      if (error || !data.length) {
        toast.error(error?.message ?? "Only owners and admins can change this.")
        return
      }
      toast.success("Detention settings saved.")
      router.refresh()
    })
  }

  return (
    <SettingsCard
      title="Detention"
      description="For loads with free time and a detention rate on the rate con, counted from the driver's check-in, or from the appointment when they're early."
      footer={
        <SettingsCardFooter
          hint={
            canEdit
              ? "Notices go to the broker's dispatch contacts, unless their status updates are switched off."
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
          checked={notify}
          disabled={!canEdit}
          onCheckedChange={(checked) => setNotify(checked === true)}
        />
        <span>
          Email the broker 30 minutes before free time runs out, and when
          detention starts
          <span className="block text-sm text-muted-foreground">
            With the check-in time, where the driver was, and a request for
            their detention authorization number.
          </span>
        </span>
      </Label>
      <Label className="flex items-start gap-3 font-normal">
        <Checkbox
          className="mt-0.5"
          checked={charge}
          disabled={!canEdit}
          onCheckedChange={(checked) => setCharge(checked === true)}
        />
        <span>
          Add the detention charge when the driver leaves past free time
          <span className="block text-sm text-muted-foreground">
            In quarter hours, rounded up, at the load&apos;s detention rate,
            with the in and out times. Change or remove it like any other
            charge.
          </span>
        </span>
      </Label>
    </SettingsCard>
  )
}
