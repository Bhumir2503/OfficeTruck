"use client"

import { useState } from "react"
import { toast } from "sonner"

import { setShareRateWithDrivers } from "@/app/org/[slug]/settings/actions"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

/** What drivers see on loads they're sent. Saves as soon as it's changed. */
export function DispatchSettings({
  organizationId,
  shareRate,
  canEdit,
}: {
  organizationId: string
  shareRate: boolean
  canEdit: boolean
}) {
  const [share, setShare] = useState(shareRate)
  const [pending, setPending] = useState(false)

  async function change(next: boolean) {
    setShare(next)
    setPending(true)
    const result = await setShareRateWithDrivers(organizationId, next)
    setPending(false)
    if ("error" in result) {
      setShare(!next)
      toast.error(result.error)
    } else {
      toast.success(
        next
          ? "Drivers will see the rate on loads you send."
          : "The rate is hidden from drivers."
      )
    }
  }

  return (
    <SettingsCard
      title="Dispatch"
      description="What drivers see when you send them a load."
      footer={
        <SettingsCardFooter
          hint={
            canEdit
              ? "Applies to loads you send from now on."
              : "Only owners and admins can change this."
          }
        />
      }
    >
      <Label className="flex items-start gap-3 font-normal">
        <Checkbox
          checked={share}
          disabled={!canEdit || pending}
          onCheckedChange={(checked) => change(checked === true)}
          className="mt-0.5"
        />
        <span>
          Show drivers the rate and charges
          <span className="block text-sm text-muted-foreground">
            Off: drivers get the stops, appointments and pickup numbers, but not
            what the load pays.
          </span>
        </span>
      </Label>
    </SettingsCard>
  )
}
