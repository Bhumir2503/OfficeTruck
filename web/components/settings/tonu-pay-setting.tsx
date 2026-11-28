"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

const usd = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * What a driver gets when a load they were sent on turns out a TONU: the
 * default for the TONU dialog, which can change it per load.
 */
export function TonuPaySetting({
  organizationId,
  pay,
  canEdit,
}: {
  organizationId: string
  /** The saved default, or null for none. */
  pay: number | null
  canEdit: boolean
}) {
  const router = useRouter()
  const saved = pay === null ? "" : usd.format(pay)
  const [value, setValue] = useState(saved)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const changed = value.trim() !== saved

  function save() {
    const cleaned = value.replace(/[$,\s]/g, "")
    if (cleaned !== "" && !/^\d{1,8}(\.\d{0,2})?$/.test(cleaned)) {
      setError("Enter an amount like 150.00, or leave it blank.")
      return
    }
    setError(null)
    start(async () => {
      const { data, error } = await createClient()
        .from("organizations")
        .update({ tonu_driver_pay: cleaned === "" ? null : Number(cleaned) })
        .eq("id", organizationId)
        .select("id")
      if (error || !data.length) {
        toast.error(error?.message ?? "Only owners and admins can change this.")
        return
      }
      setValue(cleaned === "" ? "" : usd.format(Number(cleaned)))
      toast.success("TONU pay saved.")
      router.refresh()
    })
  }

  return (
    <SettingsCard
      title="TONU pay"
      description="What a driver gets when a load they were sent on is canceled at the dock. A TONU never pays per mile or a share of the linehaul."
      footer={
        <SettingsCardFooter
          hint={
            canEdit
              ? "It's the default when you mark a load TONU; you can change it there."
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
    >
      <Field data-invalid={!!error} className="max-w-xs">
        <FieldLabel htmlFor="tonu-driver-pay">
          Driver&apos;s TONU pay
        </FieldLabel>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <Input
            id="tonu-driver-pay"
            inputMode="decimal"
            placeholder="None"
            className="pl-6"
            value={value}
            disabled={!canEdit}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <FieldDescription>
          {error ?? "Leave it blank to pay nothing on a TONU."}
        </FieldDescription>
      </Field>
    </SettingsCard>
  )
}
