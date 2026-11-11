import { CreditCardIcon, ReceiptTextIcon, SparklesIcon } from "lucide-react"
import type { Metadata } from "next"

import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
  SettingsPage,
} from "@/components/settings/settings-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Billing" }

// Billing isn't built yet. Each card shows where its details will go rather
// than inventing a plan, price or card.
export default function BillingSettingsPage() {
  return (
    <SettingsPage
      title="Billing"
      description="Your OfficeTruck plan, how you pay and your past invoices."
    >
      <SettingsCard
        title="Plan"
        description="Your OfficeTruck plan and what it includes."
        action={<Badge variant="outline">Not set up</Badge>}
        footer={
          <SettingsCardFooter hint="Plans are coming soon.">
            <Button size="sm" disabled>
              Choose a plan
            </Button>
          </SettingsCardFooter>
        }
      >
        <SettingsEmptyState icon={SparklesIcon} title="No plan yet">
          When plans are available, you&apos;ll see yours here, along with your
          next billing date.
        </SettingsEmptyState>
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
