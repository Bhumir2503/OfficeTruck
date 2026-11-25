"use client"

import { useSyncExternalStore } from "react"

const options: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
}
const utcFormat = new Intl.DateTimeFormat("en-US", {
  ...options,
  timeZone: "UTC",
})
const localFormat = new Intl.DateTimeFormat("en-US", options)

const subscribe = () => () => {}

/**
 * The day a moment happened (an upload, a signature), as "Nov 24, 2026" in
 * the viewer's own time zone, so a 9 pm upload isn't dated tomorrow.
 *
 * Calendar dates (a due or expiry date) have no zone; use formatDate for
 * those. A timestamp does: the server can't know the viewer's zone, so it
 * renders the UTC day, and the browser switches to the local day as soon
 * as the page hydrates, without a hydration mismatch.
 */
export function LocalDate({ value }: { value: string }) {
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
  const date = new Date(value)
  return (
    <time dateTime={value}>
      {(inBrowser ? localFormat : utcFormat).format(date)}
    </time>
  )
}
