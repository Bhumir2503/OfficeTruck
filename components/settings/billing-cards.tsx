import { CreditCardIcon, ReceiptTextIcon } from "lucide-react"

import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
  SettingsPage,
} from "@/components/settings/settings-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatRate } from "@/lib/load-format"
import {
  FLEET_MINIMUM,
  FLEET_PRICE_PER_TRUCK,
  fleetMonthlyPrice,
} from "@/lib/truck-format"

function Stat({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex h-7 items-center text-lg font-semibold tabular-nums">
        {children}
      </dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  )
}

/**
 * The billing tab. Payments aren't set up yet, so the plan card shows what
 * the Fleet plan would cost for the trucks on file. With `activeTrucks`
 * null it renders as the loading state, with the numbers as placeholders.
 */
export function BillingCards({
  activeTrucks,
  parkedTrucks,
}: {
  /** Billed trucks: active ones only. */
  activeTrucks: number | null
  /** Out of service trucks, which aren't billed. */
  parkedTrucks: number | null
}) {
  const loading = activeTrucks === null
  const price = loading ? 0 : fleetMonthlyPrice(activeTrucks)
  const atMinimum =
    !loading && activeTrucks * FLEET_PRICE_PER_TRUCK < FLEET_MINIMUM
  const value = (node: React.ReactNode, width = "w-16") =>
    loading ? <Skeleton className={`h-5 ${width}`} /> : node

  return (
    <SettingsPage
      title="Billing"
      description="Your OfficeTruck plan, how you pay and your past invoices."
    >
      <SettingsCard
        title="Plan"
        description={`Fleet: ${formatRate(FLEET_PRICE_PER_TRUCK)} per active truck per month, ${formatRate(FLEET_MINIMUM)} minimum. Out of service and inactive trucks aren't billed.`}
        action={<Badge variant="outline">Not set up</Badge>}
        footer={
          <SettingsCardFooter hint="Payments are coming soon. Nothing is charged yet.">
            <Button size="sm" disabled>
              Choose a plan
            </Button>
          </SettingsCardFooter>
        }
      >
        <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <Stat label="Active trucks" hint="Billed">
            {value(activeTrucks, "w-8")}
          </Stat>
          <Stat label="Out of service" hint="Not billed">
            {value(parkedTrucks, "w-8")}
          </Stat>
          <Stat
            label="Fleet estimate"
            hint={
              loading
                ? "Per month"
                : atMinimum
                  ? "Per month, the minimum"
                  : `Per month, ${activeTrucks} × ${formatRate(FLEET_PRICE_PER_TRUCK)}`
            }
          >
            {value(formatRate(price), "w-20")}
          </Stat>
        </dl>
      </SettingsCard>

      <SettingsCard
        title="Payment method"
        description="The card or bank account you pay with."
        footer={
          <SettingsCardFooter hint="Adding a payment method is coming soon.">
            <Button size="sm" variant="outline" disabled>
              Add payment method
            </Button>
          </SettingsCardFooter>
        }
      >
        <SettingsEmptyState
          icon={CreditCardIcon}
          title="No payment method on file"
        >
          You haven&apos;t added a card or bank account.
        </SettingsEmptyState>
      </SettingsCard>

      <SettingsCard
        title="Billing history"
        description="Past OfficeTruck invoices and receipts to download."
        footer={<SettingsCardFooter hint="0 invoices" />}
      >
        <SettingsEmptyState icon={ReceiptTextIcon} title="No invoices yet">
          Invoices from OfficeTruck will show up here once billing starts.
        </SettingsEmptyState>
      </SettingsCard>
    </SettingsPage>
  )
}
