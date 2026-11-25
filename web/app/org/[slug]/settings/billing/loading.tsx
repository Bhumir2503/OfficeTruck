import { BillingCards } from "@/components/settings/billing-cards"

/** The billing tab with its truck counts and estimate as placeholders. */
export default function BillingLoading() {
  return <BillingCards activeTrucks={null} parkedTrucks={null} />
}
