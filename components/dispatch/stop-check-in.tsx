"use client"

import { LogIn, LogOut } from "lucide-react"
import { useState } from "react"

import { recordStopByToken } from "@/app/dispatch/[token]/actions"
import { LocalTime } from "@/components/loads/local-time"
import { Button } from "@/components/ui/button"

/**
 * The driver's Arrived and Departed buttons for one stop. Once tapped, the
 * time shows instead. The server's clock sets the time, not the phone's.
 */
export function StopCheckIn({
  token,
  position,
  arrivedAt,
  departedAt,
  open,
}: {
  token: string
  position: number
  arrivedAt: string | null
  departedAt: string | null
  /** Whether check-in is open: the load is on the road. */
  open: boolean
}) {
  const [arrived, setArrived] = useState(arrivedAt)
  const [departed, setDeparted] = useState(departedAt)
  const [pending, setPending] = useState<"arrived" | "departed" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function tap(event: "arrived" | "departed") {
    setPending(event)
    setError(null)
    const result = await recordStopByToken(token, position, event)
    setPending(null)
    if ("error" in result) {
      setError(result.error)
    } else if (event === "arrived") {
      setArrived(result.at)
    } else {
      setDeparted(result.at)
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {arrived ? (
          <p className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-2 text-sm">
            <LogIn className="size-4 text-muted-foreground" />
            In <LocalTime value={arrived} />
          </p>
        ) : (
          <Button
            size="lg"
            disabled={!open || pending !== null}
            onClick={() => tap("arrived")}
          >
            <LogIn />
            {pending === "arrived" ? "Saving…" : "Arrived"}
          </Button>
        )}
        {departed ? (
          <p className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-2 text-sm">
            <LogOut className="size-4 text-muted-foreground" />
            Out <LocalTime value={departed} />
          </p>
        ) : (
          <Button
            size="lg"
            variant={arrived ? "default" : "outline"}
            disabled={!open || !arrived || pending !== null}
            onClick={() => tap("departed")}
          >
            <LogOut />
            {pending === "departed" ? "Saving…" : "Departed"}
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
