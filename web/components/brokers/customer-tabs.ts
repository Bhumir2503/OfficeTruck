export const CUSTOMER_TABS = ["overview", "loads", "payments", "fmcsa"] as const
export type CustomerTab = (typeof CUSTOMER_TABS)[number]

export const CUSTOMER_TAB_LABELS: Record<CustomerTab, string> = {
  overview: "Overview",
  loads: "Loads",
  payments: "Payments",
  fmcsa: "FMCSA",
}

/** The tabs a customer has: only brokers have authority to check. */
export function customerTabs(kind: "broker" | "shipper"): CustomerTab[] {
  return kind === "broker"
    ? [...CUSTOMER_TABS]
    : CUSTOMER_TABS.filter((tab) => tab !== "fmcsa")
}

/** `?tab=` on the customer page; anything else is the overview. */
export function parseCustomerTab(value: unknown): CustomerTab {
  return CUSTOMER_TABS.includes(value as CustomerTab)
    ? (value as CustomerTab)
    : "overview"
}

/** A link to one of the customer page's tabs. */
export function customerTabHref(customerHref: string, tab: CustomerTab) {
  return `${customerHref}${tab === "overview" ? "" : `?tab=${tab}`}`
}
