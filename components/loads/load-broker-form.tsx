"use client"

import { CornerDownLeft } from "lucide-react"
import { toast } from "sonner"

import { updateLoadBroker } from "@/app/org/[slug]/loads/actions"
import { BrokerFields } from "@/components/loads/broker-fields"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import { useZodForm } from "@/hooks/use-zod-form"
import type { BrokerOption } from "@/lib/brokers"
import type { Load } from "@/lib/loads"
import { loadBrokerSchema } from "@/lib/schemas/load"

/**
 * The broker on a booked load. Changes who it's with, links a load that only
 * had a typed broker name to one of your brokers, and re-checks the rate con
 * sender. Any member can change it, like the rest of the load.
 */
export function LoadBrokerForm({
  organizationId,
  load,
  brokers,
  brokersHref,
  factoringName,
}: {
  organizationId: string
  load: Load
  brokers: BrokerOption[]
  /** /org/<slug>/brokers */
  brokersHref: string
  factoringName: string | null
}) {
  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    loadBrokerSchema,
    async (values) => {
      const result = await updateLoadBroker(organizationId, load.id, values)
      if ("error" in result) {
        return result.error
      }
      toast.success(`Load ${load.reference} saved.`)
    }
  )

  const unlinked = !load.broker_id

  return (
    <form {...formProps} autoComplete="off">
      <fieldset disabled={pending}>
        <SettingsCard
          title="Broker"
          description={
            unlinked
              ? `Booked as "${load.broker_name}". Pick the broker to link the load to them.`
              : "Who booked it, and who sent the rate con."
          }
          contentClassName="grid gap-5 sm:grid-cols-6"
          footer={
            <SettingsCardFooter
              hint={
                formError ? (
                  <span className="text-destructive">{formError}</span>
                ) : (
                  "Linking a broker re-checks them with FMCSA."
                )
              }
            >
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save"} <CornerDownLeft />
              </Button>
            </SettingsCardFooter>
          }
        >
          <BrokerFields
            brokers={brokers}
            brokersHref={brokersHref}
            factoringName={factoringName}
            defaults={{
              brokerId: load.broker_id,
              brokerName: load.broker_name,
              sender: load.rate_con_from,
            }}
            errors={errors}
            onUpdate={revalidate}
          />
        </SettingsCard>
      </fieldset>
    </form>
  )
}
