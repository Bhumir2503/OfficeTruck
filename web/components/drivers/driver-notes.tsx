"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { updateDriverNotes } from "@/app/org/[slug]/drivers/actions"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

/**
 * The driver's notes, beside the driver page: anything the office should
 * remember about them. Saved on their own; owners and admins can edit,
 * members only read them.
 */
export function DriverNotes({
  organizationId,
  driverId,
  notes,
  canManage,
}: {
  organizationId: string
  driverId: string
  notes: string | null
  canManage: boolean
}) {
  const [saved, setSaved] = useState(notes ?? "")
  const [draft, setDraft] = useState(notes ?? "")
  const [pending, start] = useTransition()
  const changed = draft.trim() !== saved.trim()

  function save() {
    start(async () => {
      const result = await updateDriverNotes(organizationId, driverId, draft)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      setSaved(draft.trim())
      setDraft(draft.trim())
      toast.success("Notes saved.")
    })
  }

  return (
    <section className="shrink-0 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
      <div className="flex flex-col gap-3 px-5 pt-4 pb-5">
        <h4 className="font-semibold">Notes</h4>
        {canManage ? (
          <>
            <Textarea
              aria-label="Notes"
              rows={4}
              maxLength={2000}
              placeholder="Endorsements, home terminal, preferred lanes…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Cmd/Ctrl+Enter saves.
                if (
                  event.key === "Enter" &&
                  (event.metaKey || event.ctrlKey) &&
                  changed
                ) {
                  event.preventDefault()
                  save()
                }
              }}
            />
            {changed && (
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setDraft(saved)}
                >
                  Cancel
                </Button>
                <Button size="sm" disabled={pending} onClick={save}>
                  {pending ? "Saving…" : "Save"}
                </Button>
              </div>
            )}
          </>
        ) : saved ? (
          <p className="text-sm whitespace-pre-wrap">{saved}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No notes.</p>
        )}
      </div>
    </section>
  )
}
