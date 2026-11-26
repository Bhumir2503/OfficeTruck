"use client"

import { cn } from "cn"
import { Timer } from "lucide-react"
import { useEffect, useState } from "react"

import { detentionClock, formatDuration, formatRate } from "@/lib/load-format"

const clockFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
})

/** Now, updated every 30 seconds; null until mounted, so the server and the browser agree. */
function useNow() {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const timer = setInterval(tick, 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

/**
 * A driver waiting at a stop: time waited and free time left, then, once
 * free time runs out, how long detention has run and what it comes to so
 * far. Amber in the last half hour of free time, red once it's started.
 */
export function DetentionClock({
  stop,
  terms,
  className,
}: {
  stop: { arrived_at: string | null; departed_at: string | null }
  terms: { detention_free_hours: number | null; detention_rate: number | null }
  className?: string
}) {
  const now = useNow()
  if (now === null) return null
  const clock = detentionClock(stop, terms, now)
  if (!clock) return null
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-x-1.5 text-sm",
        clock.started
          ? "text-destructive"
          : clock.soon
            ? "text-amber-700 dark:text-amber-300"
            : "text-muted-foreground",
        className
      )}
    >
      <Timer className="size-3.5 shrink-0" aria-hidden />
      {clock.started ? (
        <>
          <span className="font-medium">
            In detention {formatDuration(clock.over)}
          </span>
          {clock.amount !== null && (
            <span>· {formatRate(clock.amount)} so far</span>
          )}
        </>
      ) : (
        <>
          <span>Waiting {formatDuration(clock.waiting)}</span>
          <span>
            · detention starts {clockFormat.format(new Date(clock.freeUntil))}
          </span>
        </>
      )}
    </span>
  )
}
