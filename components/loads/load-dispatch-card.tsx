"use client"

import {
  AlertTriangle,
  Check,
  CheckCheck,
  Copy,
  Send,
  UserMinus,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { sendToDriver, unassignLoad } from "@/app/org/[slug]/loads/actions"
import { LocalTime } from "@/components/loads/local-time"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import type { LoadDispatch } from "@/lib/dispatch"
import type { LoadStatus } from "@/lib/schemas/load"

/** Seen and accepted, as small checkmarks rather than a status. */
function Receipt({ dispatch }: { dispatch: LoadDispatch }) {
  if (dispatch.accepted_at) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
        <CheckCheck className="size-4" />
        Accepted <LocalTime value={dispatch.accepted_at} />
      </span>
    )
  }
  if (dispatch.seen_at) {
    return (
      <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300">
        <Check className="size-4" />
        Seen <LocalTime value={dispatch.seen_at} />
      </span>
    )
  }
  return <span className="text-muted-foreground">Not opened yet</span>
}

/**
 * Sending the load to its driver, and what's happened since: the driver
 * opening and accepting it, sending it again, or taking it back.
 */
export function LoadDispatchCard({
  organizationId,
  load,
  dispatch,
  link,
  shareRate,
  overlaps,
  driverEmail,
  loadsBase,
  settingsHref,
}: {
  organizationId: string
  load: {
    id: string
    reference: string
    status: LoadStatus
    driverName: string | null
    truckName: string | null
  }
  dispatch: LoadDispatch | null
  /** The live dispatch's private link. */
  link: string | null
  /** Whether the company sends the rate to drivers. */
  shareRate: boolean
  /** The driver's other loads at the same time. */
  overlaps: { id: string; reference: string }[]
  driverEmail: string | null
  /** /org/<slug>/loads */
  loadsBase: string
  /** /org/<slug>/settings */
  settingsHref: string
}) {
  const [pending, setPending] = useState<"send" | "unassign" | null>(null)
  const [confirming, setConfirming] = useState(false)

  const assigned = !!load.driverName && !!load.truckName
  const dispatched = load.status === "dispatched"

  async function send() {
    setPending("send")
    const result = await sendToDriver(organizationId, load.id)
    setPending(null)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    const verb = result.resent ? "sent again" : "sent"
    if (result.emailError) {
      toast.warning(
        `Load ${load.reference} ${verb} to ${load.driverName}. ${result.emailError}`
      )
    } else {
      toast.success(`Load ${load.reference} ${verb} to ${load.driverName}.`)
    }
    if (result.warning) {
      toast.warning(result.warning)
    }
  }

  async function unassign() {
    setPending("unassign")
    const result = await unassignLoad(organizationId, load.id)
    setPending(null)
    setConfirming(false)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success(
      `${load.driverName ?? "The driver"} was taken off load ${load.reference}. It's back to booked.`
    )
    if (result.emailError) {
      toast.warning(result.emailError)
    }
  }

  async function copyLink() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      toast.success(
        "Link copied. Text it to the driver if they didn't get the email."
      )
    } catch {
      toast.error("Couldn't copy the link.")
    }
  }

  // Past dispatch, the card only reports what the driver saw.
  if (!dispatched && load.status !== "booked") {
    if (!dispatch) return null
    return (
      <SettingsCard
        title="Dispatch"
        description={
          <>
            Sent to {dispatch.driver?.full_name ?? "the driver"}{" "}
            <LocalTime value={dispatch.sent_at} />.
          </>
        }
      >
        <p className="text-sm">
          <Receipt dispatch={dispatch} />
        </p>
      </SettingsCard>
    )
  }

  const rateNote = (
    <>
      {shareRate ? "Includes the rate." : "The rate isn't included."}{" "}
      <Link href={settingsHref} className="underline">
        Change
      </Link>
    </>
  )

  return (
    <SettingsCard
      title="Dispatch"
      description={
        dispatched && dispatch ? (
          <>
            Sent to {dispatch.driver?.full_name ?? load.driverName}{" "}
            <LocalTime value={dispatch.sent_at} />
            {dispatch.email_to ? ` at ${dispatch.email_to}` : ""}.
          </>
        ) : assigned ? (
          `Sends ${load.driverName} the stops, appointments, pickup numbers and rate con.`
        ) : (
          "Assign a truck and driver below, then send the load to them."
        )
      }
      footer={
        <SettingsCardFooter
          hint={
            dispatched
              ? "Unassigning sends the load back to booked and tells the driver."
              : rateNote
          }
        >
          {dispatched ? (
            confirming ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!!pending}
                  onClick={() => setConfirming(false)}
                >
                  Keep
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!!pending}
                  onClick={unassign}
                >
                  <UserMinus />
                  {pending === "unassign"
                    ? "Unassigning…"
                    : `Take ${load.driverName?.split(" ")[0] ?? "them"} off`}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!pending}
                  onClick={() => setConfirming(true)}
                >
                  <UserMinus />
                  Unassign
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!pending}
                  onClick={send}
                >
                  <Send />
                  {pending === "send" ? "Sending…" : "Send again"}
                </Button>
              </>
            )
          ) : (
            <Button size="sm" disabled={!assigned || !!pending} onClick={send}>
              <Send />
              {pending === "send"
                ? "Sending…"
                : assigned
                  ? `Send to ${load.driverName?.split(" ")[0]}`
                  : "Send to driver"}
            </Button>
          )}
        </SettingsCardFooter>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {dispatched && dispatch && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Receipt dispatch={dispatch} />
            {link && (
              <Button variant="ghost" size="sm" onClick={copyLink}>
                <Copy />
                Copy driver link
              </Button>
            )}
          </div>
        )}
        {assigned && !dispatched && !driverEmail && (
          <p className="text-muted-foreground">
            {load.driverName} has no email address, so you&apos;ll get a link to
            send them yourself.
          </p>
        )}
        {overlaps.length > 0 && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-amber-800 dark:text-amber-200"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {load.driverName} is also on{" "}
              {overlaps.map((other, index) => (
                <span key={other.id}>
                  {index > 0 && ", "}
                  <Link
                    href={`${loadsBase}/${other.id}`}
                    className="font-medium underline"
                  >
                    {other.reference}
                  </Link>
                </span>
              ))}{" "}
              at the same time.
            </span>
          </div>
        )}
        {!dispatched &&
          overlaps.length === 0 &&
          (!assigned || !!driverEmail) && (
            <p className="text-muted-foreground">
              The load stays booked until it&apos;s sent.
            </p>
          )}
      </div>
    </SettingsCard>
  )
}
