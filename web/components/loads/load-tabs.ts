/*
 * The load page's tabs. Related cards share a tab: the trip is who's hauling
 * it and where, billing is who pays and for what.
 */
export const LOAD_TABS = ["trip", "billing", "expenses", "history"] as const
export type LoadTab = (typeof LOAD_TABS)[number]

export const LOAD_TAB_LABELS: Record<LoadTab, string> = {
  trip: "Trip",
  billing: "Billing",
  expenses: "Expenses",
  history: "History",
}

/** Where links to the tabs the page used to have now land. */
const OLD_TABS: Record<string, LoadTab> = {
  stops: "trip",
  assignment: "trip",
  customer: "billing",
  charges: "billing",
}

/** `?tab=` on the load page; anything else is the first tab. */
export function parseLoadTab(value: unknown): LoadTab {
  if (LOAD_TABS.includes(value as LoadTab)) return value as LoadTab
  return (typeof value === "string" && OLD_TABS[value]) || "trip"
}

/** A link to one of the load page's tabs. */
export function loadTabHref(loadHref: string, tab: LoadTab) {
  return tab === "trip" ? loadHref : `${loadHref}?tab=${tab}`
}
