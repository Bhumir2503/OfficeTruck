"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  type BrokerAutomation,
  setBrokerAutomation,
} from "@/app/org/[slug]/customers/actions"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type Choice = "default" | "on" | "off"

const toChoice = (value: boolean | null): Choice =>
  value === null ? "default" : value ? "on" : "off"

/**
 * One of a customer's automations (status updates, automatic invoicing):
 * the company's default, or on or off for them alone. Saves as soon as it's
 * picked. The footer says what happens while it's on.
 */
export function CustomerAutomationCard({
  organizationId,
  brokerId,
  field,
  title,
  description,
  value,
  companyDefault,
  whenOn,
  whenOff,
  settingsHref,
}: {
  organizationId: string
  brokerId: string
  field: BrokerAutomation
  title: string
  description: string
  value: boolean | null
  /** The company's setting, which "default" follows. */
  companyDefault: boolean
  /** The footer while it's on, e.g. who the updates go to. */
  whenOn: React.ReactNode
  /** The footer while it's off. */
  whenOff: string
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
      const result = await setBrokerAutomation(
        organizationId,
        brokerId,
        field,
        next === "default" ? null : next === "on"
      )
      if ("error" in result) {
        setChoice(previous)
        toast.error(result.error)
        return
      }
      toast.success(`${title} saved.`)
    })
  }

  return (
    <SettingsCard
      title={title}
      description={description}
      footer={<SettingsCardFooter hint={on ? whenOn : whenOff} />}
    >
      <ToggleGroup
        aria-label={title}
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
