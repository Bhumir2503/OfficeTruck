"use client"

import { cn } from "cn"
import { LogIn, LogOut, Pencil, Timer } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  addAccessorial,
  recordStopEvent,
  saveLoadStops,
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
import type { Load, LoadStop } from "@/lib/loads"
import {
  loadStopsSchema,
  STOP_KIND_LABELS,
  type LoadStatus,
} from "@/lib/schemas/load"

/** Check-in is for loads on the road. */
const canCheckIn = (status: LoadStatus) =>
  status === "dispatched" || status === "loaded" || status === "delivered"

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
 * The load's stops in order. The driver taps arrived and departed at each
 * one; those times are the proof for detention.
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
  const live = canCheckIn(load.status)
  const hasTerms =
    load.detention_free_hours !== null && load.detention_rate !== null

  async function tap(stop: LoadStop, event: "arrived" | "departed") {
    setPending(`${stop.id}:${event}`)
    const result = await recordStopEvent(organizationId, stop.id, event)
    setPending(null)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(
        `${event === "arrived" ? "Arrived at" : "Departed"} stop ${stop.position}.`
      )
    }
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
            live
              ? "Arrived and departed are stamped with the server's clock and can't be changed."
              : load.status === "booked"
                ? "Dispatch the load to check in at stops."
                : "Check-in is closed for this load."
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
                <div className="flex flex-wrap items-center gap-2">
                  {stop.arrived_at ? (
                    <span className="inline-flex items-center gap-1.5">
                      <LogIn className="size-3.5 text-muted-foreground" />
                      <Moment value={stop.arrived_at} />
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!live || pending !== null}
                      onClick={() => tap(stop, "arrived")}
                    >
                      <LogIn />
                      {pending === `${stop.id}:arrived` ? "Saving…" : "Arrived"}
                    </Button>
                  )}
                  {stop.departed_at ? (
                    <span className="inline-flex items-center gap-1.5">
                      <LogOut className="size-3.5 text-muted-foreground" />
                      <Moment value={stop.departed_at} />
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!live || !stop.arrived_at || pending !== null}
                      onClick={() => tap(stop, "departed")}
                    >
                      <LogOut />
                      {pending === `${stop.id}:departed`
                        ? "Saving…"
                        : "Departed"}
                    </Button>
                  )}
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
