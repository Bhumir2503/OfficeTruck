"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"

// Keep in step with the check on organizations.time_zone.
const TIME_ZONES = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Phoenix", label: "Arizona (no daylight time)" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
]

/**
 * Where the company keeps its clock: the times in emails to brokers, and
 * the day a load counts as delivered.
 */
export function TimeZoneSetting({
  organizationId,
  timeZone,
  canEdit,
}: {
  organizationId: string
  timeZone: string
  canEdit: boolean
}) {
  const router = useRouter()
  const [zone, setZone] = useState(timeZone)
  const [pending, start] = useTransition()

  function save() {
    start(async () => {
      const { data, error } = await createClient()
        .from("organizations")
        .update({ time_zone: zone })
        .eq("id", organizationId)
        .select("id")
      if (error || !data.length) {
        toast.error(error?.message ?? "Only owners and admins can change this.")
        return
      }
      toast.success("Time zone saved.")
      router.refresh()
    })
  }

  return (
    <SettingsCard
      title="Time zone"
      description="Your office's time. Status updates and detention notices to brokers give times in it, and it decides the day a load was delivered."
      footer={
        <SettingsCardFooter
          hint={
            canEdit
              ? "Appointment times on a load are always shown as written on the rate con."
              : "Only owners and admins can change this."
          }
        >
          {canEdit && (
            <Button
              size="sm"
              disabled={pending || zone === timeZone}
              onClick={save}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          )}
        </SettingsCardFooter>
      }
      contentClassName="flex flex-col gap-2"
    >
      <Label htmlFor="organization-time-zone">Time zone</Label>
      <Select
        value={zone}
        onValueChange={(next) => next && setZone(next as string)}
        items={TIME_ZONES}
        disabled={!canEdit}
      >
        <SelectTrigger id="organization-time-zone" className="w-full sm:w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TIME_ZONES.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsCard>
  )
}
