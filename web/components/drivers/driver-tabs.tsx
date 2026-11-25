export const DRIVER_TABS = [
  "overview",
  "pay",
  "loads",
  "documents",
  "file",
] as const
export type DriverTab = (typeof DRIVER_TABS)[number]

export const DRIVER_TAB_LABELS: Record<DriverTab, string> = {
  overview: "Overview",
  pay: "Payment",
  loads: "Loads",
  documents: "Documents",
  file: "Qualification file",
}

/** `?tab=` on the driver page; anything else is the overview. */
export function parseDriverTab(value: unknown): DriverTab {
  return DRIVER_TABS.includes(value as DriverTab)
    ? (value as DriverTab)
    : "overview"
}

/** A link to one of the driver page's tabs, optionally to a card on it. */
export function driverTabHref(
  driverHref: string,
  tab: DriverTab,
  hash?: string
) {
  return `${driverHref}${tab === "overview" ? "" : `?tab=${tab}`}${hash ? `#${hash}` : ""}`
}
