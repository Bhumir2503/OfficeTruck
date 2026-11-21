"use client"

import { Gauge, LogIn, LogOut } from "lucide-react"
import { useState } from "react"

import {
  recordOdometerByToken,
  recordStopByToken,
} from "@/app/dispatch/[token]/actions"
import { LocalTime } from "@/components/loads/local-time"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Event = "arrived" | "departed"

const miles = new Intl.NumberFormat("en-US")

/** How far off a reading can be from what's expected before we double-check. */
const SURPRISE_MILES = 1000

/**
 * Asks for the odometer right after a tap, while the truck is stopped. Never
 * blocks the check-in: the driver can skip it, and the office can fill it in.
 */
function OdometerPrompt({
  token,
  position,
  event,
  expected,
  initial,
  onSaved,
  onSkip,
  onCancel,
}: {
  token: string
  position: number
  event: Event
  /** The reading we'd expect, to catch typos; null if we don't know. */
  expected: number | null
  /** The saved reading, when the driver is changing it. */
  initial?: number | null
  onSaved: (reading: number) => void
  onSkip?: () => void
  /** Closes the box without changing the saved reading. */
  onCancel?: () => void
}) {
  const [value, setValue] = useState(
    initial == null ? "" : miles.format(initial)
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A reading far from what's expected, waiting for a second tap to save.
  const [confirming, setConfirming] = useState<number | null>(null)

  async function save(reading: number) {
    setPending(true)
    setError(null)
    const result = await recordOdometerByToken(token, position, event, reading)
    setPending(false)
    if ("error" in result) {
      setError(result.error)
      setConfirming(null)
    } else {
      onSaved(reading)
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reading = Number(value.replace(/[^\d]/g, ""))
    if (!value.trim() || !Number.isInteger(reading)) {
      setError("Enter the odometer in miles.")
      return
    }
    if (initial != null && reading === initial) {
      onCancel?.()
      return
    }
    if (
      confirming !== reading &&
      expected !== null &&
      Math.abs(reading - expected) > SURPRISE_MILES
    ) {
      setConfirming(reading)
      return
    }
    void save(reading)
  }

  const off =
    confirming !== null && expected !== null ? confirming - expected : 0

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3"
    >
      <label
        htmlFor={`odometer-${position}-${event}`}
        className="flex items-center gap-1.5 text-sm font-medium"
      >
        <Gauge className="size-4 text-muted-foreground" />
        Odometer {event === "arrived" ? "at pickup" : "leaving"}
      </label>
      <div className="flex gap-2">
        <Input
          id={`odometer-${position}-${event}`}
          inputMode="numeric"
          autoComplete="off"
          placeholder={expected !== null ? miles.format(expected) : "Miles"}
          value={value}
          onChange={(change) => {
            setValue(change.target.value.replace(/[^\d,]/g, ""))
            setConfirming(null)
          }}
          className="h-11 text-base"
        />
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : confirming !== null ? "Save anyway" : "Save"}
        </Button>
      </div>
      {confirming !== null ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          That&apos;s {miles.format(Math.abs(off))} mi{" "}
          {off > 0 ? "more" : "less"} than expected. Check it, then tap Save
          anyway.
        </p>
      ) : (
        expected !== null && (
          <p className="text-xs text-muted-foreground">
            About {miles.format(expected)} mi expected.
          </p>
        )
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="self-start text-sm text-muted-foreground underline underline-offset-2"
        >
          Cancel
        </button>
      ) : (
        <button
          type="button"
          onClick={onSkip}
          className="self-start text-sm text-muted-foreground underline underline-offset-2"
        >
          Skip for now
        </button>
      )}
    </form>
  )
}

/**
 * The driver's Arrived and Departed buttons for one stop. Once tapped, the
 * time shows instead. The server's clock sets the time, not the phone's.
 * At the first pickup and the last stop it then asks for the odometer.
 */
export function StopCheckIn({
  token,
  position,
  arrivedAt,
  departedAt,
  open,
  askOdometer,
  arrivedOdometer,
  departedOdometer,
  expectedOdometer,
}: {
  token: string
  position: number
  arrivedAt: string | null
  departedAt: string | null
  /** Whether check-in is open: the load is on the road. */
  open: boolean
  /** Which tap asks for the odometer here, if either. */
  askOdometer: Event | null
  arrivedOdometer: number | null
  departedOdometer: number | null
  /** The reading we'd expect at that tap, to catch typos. */
  expectedOdometer: number | null
}) {
  const [arrived, setArrived] = useState(arrivedAt)
  const [departed, setDeparted] = useState(departedAt)
  const [pending, setPending] = useState<Event | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(
    askOdometer === "arrived" ? arrivedOdometer : departedOdometer
  )
  const [skipped, setSkipped] = useState(false)
  // Changing a reading already saved, e.g. to fix a typo.
  const [editing, setEditing] = useState(false)

  async function tap(event: Event) {
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

  // The tap that asks for the odometer has happened, and there's no reading.
  const tapped = askOdometer === "arrived" ? arrived : departed
  const asking = open && askOdometer !== null && !!tapped && reading === null

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
      {reading !== null &&
        askOdometer !== null &&
        (editing ? (
          <OdometerPrompt
            token={token}
            position={position}
            event={askOdometer}
            expected={expectedOdometer}
            initial={reading}
            onSaved={(next) => {
              setReading(next)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Gauge className="size-4" />
            Odometer {miles.format(reading)} mi
            {open && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="ml-1 font-medium text-foreground underline underline-offset-2"
              >
                Edit
              </button>
            )}
          </p>
        ))}
      {asking &&
        (skipped ? (
          <button
            type="button"
            onClick={() => setSkipped(false)}
            className="flex items-center gap-1.5 self-start text-sm text-muted-foreground underline underline-offset-2"
          >
            <Gauge className="size-4" />
            Add the odometer
          </button>
        ) : (
          <OdometerPrompt
            token={token}
            position={position}
            event={askOdometer}
            expected={expectedOdometer}
            onSaved={setReading}
            onSkip={() => setSkipped(true)}
          />
        ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
