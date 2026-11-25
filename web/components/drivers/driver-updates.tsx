"use client"

import { FileText } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { reviewDriverUpdate } from "@/app/org/[slug]/drivers/actions"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Textarea } from "@/components/ui/textarea"
import { formatDate } from "@/lib/driver-format"
import type { DriverUpdate } from "@/lib/drivers"

const KIND_LABELS: Record<DriverUpdate["kind"], string> = {
  cdl: "CDL",
  medical_card: "Medical card",
}

/**
 * Beside the driver page, for owners and admins: a new CDL or medical card
 * the driver sent from the app. Accepting puts the copy in their documents
 * and the date on the driver; declining sends the driver a note.
 */
export function DriverUpdates({
  organizationId,
  updates,
  today,
}: {
  organizationId: string
  updates: DriverUpdate[]
  today: string
}) {
  if (!updates.length) return null
  return (
    <section className="shrink-0 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
      <div className="flex flex-col gap-4 px-5 pt-4 pb-5">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            From the driver app
          </p>
          <h4 className="mt-1 font-semibold">
            {updates.length === 1
              ? "1 update to review"
              : `${updates.length} updates to review`}
          </h4>
        </div>
        {updates.map((update) => (
          <UpdateRow
            key={update.id}
            organizationId={organizationId}
            update={update}
            today={today}
          />
        ))}
      </div>
    </section>
  )
}

function UpdateRow({
  organizationId,
  update,
  today,
}: {
  organizationId: string
  update: DriverUpdate
  today: string
}) {
  const [expiresOn, setExpiresOn] = useState(update.expires_on)
  const [declining, setDeclining] = useState(false)
  const [note, setNote] = useState("")
  const [pending, start] = useTransition()
  const label = KIND_LABELS[update.kind]

  function review(accept: boolean) {
    start(async () => {
      const result = await reviewDriverUpdate(organizationId, update.id, {
        accept,
        expiresOn:
          accept && expiresOn !== update.expires_on ? expiresOn : undefined,
        note: accept ? undefined : note,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(accept ? `${label} accepted.` : "Sent back to the driver.")
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">New {label.toLowerCase()}</p>
          <p className="text-sm text-muted-foreground">
            Sent {formatDate(update.created_at.slice(0, 10))}
          </p>
        </div>
        {update.url && (
          <a
            href={update.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium hover:underline"
          >
            <FileText className="size-4" />
            View
          </a>
        )}
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted-foreground">
          Expires (check it against the card)
        </span>
        <DatePicker
          value={expiresOn}
          onChange={setExpiresOn}
          min={today}
          required
          aria-label={`${label} expiration date`}
          years={{ back: 0, ahead: 10 }}
        />
      </label>

      {declining ? (
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label="Why it's declined"
            rows={2}
            maxLength={500}
            placeholder="Blurry, wrong card, date doesn't match…"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setDeclining(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending || !note.trim()}
              onClick={() => review(false)}
            >
              {pending ? "Sending…" : "Decline"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setDeclining(true)}
          >
            Decline
          </Button>
          <Button
            size="sm"
            disabled={pending || !expiresOn}
            onClick={() => review(true)}
          >
            {pending ? "Saving…" : "Accept"}
          </Button>
        </div>
      )}
    </div>
  )
}
