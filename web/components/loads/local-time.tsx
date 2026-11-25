"use client"

import { useSyncExternalStore } from "react"

const format = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const subscribe = () => () => {}

/**
 * A moment shown in the viewer's own time zone, e.g. "Nov 13, 8:10 AM". The
 * server doesn't know the viewer's zone, so it renders nothing and the
 * browser fills it in, rather than showing a time that then changes.
 */
export function LocalTime({ value }: { value: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => format.format(new Date(value)),
    () => ""
  )
  return (
    <time dateTime={value} suppressHydrationWarning>
      {text}
    </time>
  )
}
