"use client"

import { cn } from "cn"
import { format } from "date-fns"
import { Clock, LogIn, LogOut, Pencil, Timer } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  addAccessorial,
  saveLoadStops,
  setStopTime,
} from "@/app/org/[slug]/loads/actions"
import { StopsEditor } from "@/components/loads/stops-editor"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  formatDuration,
  formatRate,
  formatStopWindow,
  stopDetention,
} from "@/lib/load-format"
import type { Load, LoadStop, StopTimeSource } from "@/lib/loads"
import {
  loadStopsSchema,
  STOP_KIND_LABELS,
  type LoadStatus,
} from "@/lib/schemas/load"

/** The office can enter times once the load is dispatched. */
const canEnterTimes = (status: LoadStatus) =>
  status !== "booked" && status !== "cancelled"

const SOURCE_LABELS: Record<StopTimeSource, string> = {
  driver: "Driver",
  office: "Office",
  eld: "ELD",
}

type TimeEvent = "arrived" | "departed"

/** The office entering (or fixing its own) arrival or departure, with a reason. */
function StopTimeForm({
  organizationId,
  stop,
  event,
  onDone,
}: {
  organizationId: string
  stop: LoadStop
  event: TimeEvent
  onDone: () => void
}) {
  const current = event === "arrived" ? stop.arrived_at : stop.departed_at
  const [when, setWhen] = useState(() =>
    format(current ? new Date(current) : new Date(), "yyyy-MM-dd'T'HH:mm")
  )
  const [reason, setReason] = useState(
    (event === "arrived" ? stop.arrived_note : stop.departed_note) ?? ""
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(formEvent: React.FormEvent) {
    formEvent.preventDefault()
    if (!when) {
      setError("Enter the date and time.")
      return
    }
    if (!reason.trim()) {
      setError('Say why, e.g. "Driver called it in".')
      return
    }
    setPending(true)
    setError(null)
    // The input is in this computer's time zone; send it as an exact moment.
    const result = await setStopTime(
      organizationId,
      stop.id,
      event,
      new Date(when).toISOString(),
      reason
    )
    setPending(false)
    if ("error" in result) {
      setError(result.error)
      return
    }
    toast.success(
      `Stop ${stop.position} ${event === "arrived" ? "arrival" : "departure"} saved.`
    )
    onDone()
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="stop-time-when" className="text-sm font-medium">
          {event === "arrived" ? "Arrived at" : "Departed at"}
        </label>
        <input
          id="stop-time-when"
          type="datetime-local"
          value={when}
          max={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
          onChange={(change) => setWhen(change.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
        <p className="text-sm text-muted-foreground">In your time zone.</p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="stop-time-reason" className="text-sm font-medium">
          Why it&apos;s being entered
        </label>
        <input
          id="stop-time-reason"
          value={reason}
          maxLength={200}
          placeholder="e.g. Driver called it in"
          onChange={(change) => setReason(change.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
        <p className="text-sm text-muted-foreground">
          Kept with the time and in the load&apos;s history.
        </p>
      </div>
      <DialogFooter className="items-center">
        {error && <p className="mr-auto text-sm text-destructive">{error}</p>}
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save time"}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** One arrival or departure: the time and where it came from, or a way to add it. */
function StopTime({
  stop,
  event,
  canEnter,
  onEnter,
}: {
  stop: LoadStop
  event: TimeEvent
  canEnter: boolean
  onEnter: () => void
}) {
  const at = event === "arrived" ? stop.arrived_at : stop.departed_at
  const source =
    event === "arrived" ? stop.arrived_source : stop.departed_source
  const note = event === "arrived" ? stop.arrived_note : stop.departed_note
  const Icon = event === "arrived" ? LogIn : LogOut
  const word = event === "arrived" ? "In" : "Out"

  if (at) {
    return (
      <div className="flex flex-col gap-0.5 sm:items-end">
        <span className="inline-flex items-center gap-1.5">
          <Icon className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{word}</span>
          <Moment value={at} />
          {source && (
            <span
              className={cn(
                "rounded-4xl px-1.5 text-xs font-medium",
                source === "office"
                  ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {SOURCE_LABELS[source]}
            </span>
          )}
          {source === "office" && canEnter && (
            <button
              type="button"
              aria-label={`Fix stop ${stop.position} ${event === "arrived" ? "arrival" : "departure"}`}
              onClick={onEnter}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil className="size-3" />
            </button>
          )}
        </span>
        {note && (
          <span className="max-w-64 truncate text-xs text-muted-foreground">
            {note}
          </span>
        )}
      </div>
    )
  }

  const blocked = event === "departed" && !stop.arrived_at
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <Icon className="size-3.5" />
      No {event === "arrived" ? "arrival" : "departure"} yet
      {canEnter && !blocked && (
        <Button size="xs" variant="ghost" onClick={onEnter}>
          <Clock />
          Add time
        </Button>
      )}
    </span>
  )
}

// Arrival and departure are real moments, shown in the viewer's time zone.
// The server renders in its own zone, so the text may differ on hydration.
const momentFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

function Moment({ value }: { value: string }) {
  return (
    <time dateTime={value} suppressHydrationWarning>
      {momentFormat.format(new Date(value))}
    </time>
  )
}

function EditStopsForm({
  organizationId,
  loadId,
  stops,
  onDone,
}: {
  organizationId: string
  loadId: string
  stops: LoadStop[]
  onDone: () => void
}) {
  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    loadStopsSchema,
    async (values) => {
      const result = await saveLoadStops(organizationId, loadId, values)
      if ("error" in result) {
        return result.error
      }
      toast.success("Stops saved.")
      onDone()
    }
  )

  return (
    <form {...formProps} autoComplete="off" className="min-h-0">
      <fieldset disabled={pending} className="flex flex-col gap-6">
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <StopsEditor
            defaultStops={stops.map((stop) => ({
              ...stop,
              locked: !!stop.arrived_at,
            }))}
            errors={errors}
            onUpdate={revalidate}
          />
        </div>
        <DialogFooter className="items-center">
          {formError && (
            <p className="mr-auto text-sm text-destructive">{formError}</p>
          )}
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save stops"}
          </Button>
        </DialogFooter>
      </fieldset>
    </form>
  )
}

/**
 * The load's stops in order, with when the truck arrived and left each one.
 * The driver records those times; the office only fills in what's missing,
 * with a reason. They're the proof for detention.
 */
export function LoadStopsCard({
  organizationId,
  load,
  stops,
  billedNotes,
}: {
  organizationId: string
  /** Notes on detention charges already added, to avoid billing a stop twice. */
  billedNotes: string[]
  load: Pick<Load, "id" | "status" | "detention_free_hours" | "detention_rate">
  stops: LoadStop[]
}) {
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const canEnter = canEnterTimes(load.status)
  // The stop and time the office is entering, if any.
  const [entering, setEntering] = useState<{
    stop: LoadStop
    event: TimeEvent
  } | null>(null)
  const [timeOpen, setTimeOpen] = useState(false)
  const hasTerms =
    load.detention_free_hours !== null && load.detention_rate !== null

  function enter(stop: LoadStop, event: TimeEvent) {
    setEntering({ stop, event })
    setTimeOpen(true)
  }

  async function billDetention(stop: LoadStop, hours: number, amount: number) {
    setPending(`${stop.id}:bill`)
    const result = await addAccessorial(organizationId, load.id, {
      kind: "detention",
      description: `Stop ${stop.position}: ${hours} h past free time`,
      amount,
    })
    setPending(null)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success("Detention added to the charges.")
    }
  }

  return (
    <SettingsCard
      title="Stops"
      description={`${stops.length} stops, in the order they're run.`}
      action={
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil />
          Edit stops
        </Button>
      }
      contentClassName="px-0 pb-0"
      footer={
        <SettingsCardFooter
          hint={
            load.status === "booked"
              ? "The driver checks in at each stop once the load is dispatched."
              : "The driver records arrival and departure. Add a time here only if they couldn't."
          }
        />
      }
    >
      <ol className="divide-y border-t">
        {stops.map((stop) => {
          const detention = stopDetention(stop, load)
          const billed = billedNotes.some((note) =>
            note.startsWith(`Stop ${stop.position}:`)
          )
          return (
            <li
              key={stop.id}
              className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex min-w-0 gap-3">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    stop.kind === "pickup"
                      ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  )}
                >
                  {stop.position}
                </span>
                <div className="min-w-0 space-y-0.5 text-sm">
                  <p className="font-medium">
                    {STOP_KIND_LABELS[stop.kind]}
                    {stop.stop_number && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · #{stop.stop_number}
                      </span>
                    )}
                  </p>
                  <p className="break-words">{stop.location}</p>
                  <p className="text-muted-foreground">
                    {formatStopWindow(
                      stop.appointment_start,
                      stop.appointment_end
                    )}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 pl-10 text-sm sm:items-end sm:pl-0">
                <div className="flex flex-col gap-1.5 sm:items-end">
                  <StopTime
                    stop={stop}
                    event="arrived"
                    canEnter={canEnter}
                    onEnter={() => enter(stop, "arrived")}
                  />
                  <StopTime
                    stop={stop}
                    event="departed"
                    canEnter={canEnter}
                    onEnter={() => enter(stop, "departed")}
                  />
                </div>
                {detention && (
                  <div className="flex flex-wrap items-center gap-2 text-muted-foreground sm:justify-end">
                    <Timer className="size-3.5" />
                    <span>{formatDuration(detention.onSite)} on site</span>
                    {hasTerms &&
                      (billed ? (
                        <span>· detention added</span>
                      ) : detention.amount > 0 ? (
                        <Button
                          size="xs"
                          variant="secondary"
                          disabled={pending !== null}
                          onClick={() =>
                            billDetention(
                              stop,
                              detention.billableHours,
                              detention.amount
                            )
                          }
                        >
                          Add {formatRate(detention.amount)} detention
                        </Button>
                      ) : (
                        <span>· within free time</span>
                      ))}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <Dialog open={timeOpen} onOpenChange={setTimeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {entering
                ? `Stop ${entering.stop.position} ${entering.event === "arrived" ? "arrival" : "departure"}`
                : "Stop time"}
            </DialogTitle>
            <DialogDescription>
              For when the driver couldn&apos;t record it. It&apos;s marked as
              entered by the office.
            </DialogDescription>
          </DialogHeader>
          {entering && (
            <StopTimeForm
              key={`${entering.stop.id}:${entering.event}`}
              organizationId={organizationId}
              stop={entering.stop}
              event={entering.event}
              onDone={() => setTimeOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit stops</DialogTitle>
            <DialogDescription>
              Add, reorder or change stops. A stop the driver has checked in at
              can&apos;t be removed.
            </DialogDescription>
          </DialogHeader>
          <EditStopsForm
            organizationId={organizationId}
            loadId={load.id}
            stops={stops}
            onDone={() => setEditing(false)}
          />
        </DialogContent>
      </Dialog>
    </SettingsCard>
  )
}
