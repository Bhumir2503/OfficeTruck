export const TRUCK_TABS = ["overview", "maintenance", "documents"] as const
export type TruckTab = (typeof TRUCK_TABS)[number]

export const TRUCK_TAB_LABELS: Record<TruckTab, string> = {
  overview: "Overview",
  maintenance: "Maintenance",
  documents: "Documents",
}

/** `?tab=` on the truck page; anything else is the overview. */
export function parseTruckTab(value: unknown): TruckTab {
  return TRUCK_TABS.includes(value as TruckTab)
    ? (value as TruckTab)
    : "overview"
}

/** A link to one of the truck page's tabs, optionally to a card on it. */
export function truckTabHref(truckHref: string, tab: TruckTab, hash?: string) {
  return `${truckHref}${tab === "overview" ? "" : `?tab=${tab}`}${hash ? `#${hash}` : ""}`
}
