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
 * The company default for automatic status updates to brokers. Each
 * customer can follow it or be switched on or off on their own page.
 */
export function BrokerUpdatesSetting({
  organizationId,
  enabled,
  canEdit,
}: {
  organizationId: string
  enabled: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)
  const [pending, start] = useTransition()

  function save() {
    start(async () => {
      const { data, error } = await createClient()
        .from("organizations")
        .update({ broker_updates: on })
        .eq("id", organizationId)
        .select("id")
      if (error || !data.length) {
        toast.error(error?.message ?? "Only owners and admins can change this.")
        return
      }
      toast.success(
        on ? "Brokers will get status updates." : "Status updates turned off."
      )
      router.refresh()
    })
  }

  return (
    <SettingsCard
      title="Status updates to brokers"
      description="When a driver checks in or out at a stop, or a load is delivered, email the broker's dispatch contacts the time and where the driver was. Never the rate."
      footer={
        <SettingsCardFooter
          hint={
            canEdit
              ? "Customers can be switched on or off one by one on their page."
              : "Only owners and admins can change this."
          }
        >
          {canEdit && (
            <Button
              size="sm"
              disabled={pending || on === enabled}
              onClick={save}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          )}
        </SettingsCardFooter>
      }
    >
      <Label className="flex items-center gap-3 font-normal">
        <Checkbox
          checked={on}
          disabled={!canEdit}
          onCheckedChange={(checked) => setOn(checked === true)}
        />
        Send status updates to brokers automatically
      </Label>
    </SettingsCard>
  )
}
