"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { setBrokerStatusUpdates } from "@/app/org/[slug]/customers/actions"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type Choice = "default" | "on" | "off"

const toChoice = (value: boolean | null): Choice =>
  value === null ? "default" : value ? "on" : "off"

/**
 * Whether this customer gets automatic status updates (arrived, left,
 * delivered): the company's default, or on or off for them alone. Saves as
 * soon as it's picked. Says who the updates go to.
 */
export function CustomerUpdatesCard({
  organizationId,
  brokerId,
  value,
  companyDefault,
  recipients,
  settingsHref,
}: {
  organizationId: string
  brokerId: string
  value: boolean | null
  /** The company's setting, which "default" follows. */
  companyDefault: boolean
  /** Their dispatch contacts' emails. */
  recipients: string[]
  /** /org/<slug>/settings */
  settingsHref: string
}) {
  const [choice, setChoice] = useState<Choice>(toChoice(value))
  const [pending, start] = useTransition()
  const on = choice === "default" ? companyDefault : choice === "on"

  function pick(next: Choice) {
    const previous = choice
    setChoice(next)
    start(async () => {
      const result = await setBrokerStatusUpdates(
        organizationId,
        brokerId,
        next === "default" ? null : next === "on"
      )
      if ("error" in result) {
        setChoice(previous)
        toast.error(result.error)
        return
      }
      toast.success("Status updates saved.")
    })
  }

  return (
    <SettingsCard
      title="Status updates"
      description="Emails when a driver arrives at or leaves a stop, and when the load is delivered: the time and where the driver was. Never the rate."
      footer={
        <SettingsCardFooter
          hint={
            !on ? (
              "They won't get automatic updates."
            ) : recipients.length ? (
              <>Goes to {recipients.join(", ")}.</>
            ) : (
              <span className="text-amber-700 dark:text-amber-300">
                No dispatch contact with an email yet. Updates go to whoever
                sent each rate con instead.
              </span>
            )
          }
        />
      }
    >
      <ToggleGroup
        aria-label="Status updates"
        variant="outline"
        size="sm"
        spacing={1}
        className="flex-wrap"
        disabled={pending}
        value={[choice]}
        onValueChange={(next: string[]) => {
          if (next[0] && next[0] !== choice) pick(next[0] as Choice)
        }}
      >
        <ToggleGroupItem value="default">
          Company default ({companyDefault ? "on" : "off"})
        </ToggleGroupItem>
        <ToggleGroupItem value="on">On</ToggleGroupItem>
        <ToggleGroupItem value="off">Off</ToggleGroupItem>
      </ToggleGroup>
      <p className="mt-3 text-sm text-muted-foreground">
        The company default is set in{" "}
        <a href={settingsHref} className="underline">
          Settings
        </a>
        .
      </p>
    </SettingsCard>
  )
}
