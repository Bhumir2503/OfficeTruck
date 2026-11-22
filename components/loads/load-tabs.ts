export const LOAD_TABS = [
  "customer",
  "stops",
  "charges",
  "assignment",
  "expenses",
  "history",
] as const
export type LoadTab = (typeof LOAD_TABS)[number]

export const LOAD_TAB_LABELS: Record<LoadTab, string> = {
  customer: "Customer",
  stops: "Stops",
  charges: "Charges",
  assignment: "Assignment",
  expenses: "Expenses",
  history: "History",
}

/** `?tab=` on the load page; anything else is the first tab. */
export function parseLoadTab(value: unknown): LoadTab {
  return LOAD_TABS.includes(value as LoadTab) ? (value as LoadTab) : "customer"
}

/** A link to one of the load page's tabs. */
export function loadTabHref(loadHref: string, tab: LoadTab) {
  return tab === "customer" ? loadHref : `${loadHref}?tab=${tab}`
}
