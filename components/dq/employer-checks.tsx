"use client"

import { PhoneCall, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { dqFetch } from "@/components/dq/dq-api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  EMPLOYER_CHECK_METHODS,
  EMPLOYER_CHECK_OUTCOMES,
  NO_PREVIOUS_EMPLOYERS,
} from "@/lib/schemas/dq"

export type EmployerCheck = {
  id: string
  /** Null for a "no previous employers" entry, with method. */
  employer_name: string | null
  employer_address: string | null
  contacted_at: string
  method: (typeof EMPLOYER_CHECK_METHODS)[number] | null
  outcome:
    (typeof EMPLOYER_CHECK_OUTCOMES)[number] | typeof NO_PREVIOUS_EMPLOYERS
  response_summary: string | null
}

const METHOD_LABELS: Record<(typeof EMPLOYER_CHECK_METHODS)[number], string> = {
  phone: "Phone",
  email: "Email",
  fax: "Fax",
  mail: "Mail",
  in_person: "In person",
  other: "Other",
}

const OUTCOME_LABELS: Record<(typeof EMPLOYER_CHECK_OUTCOMES)[number], string> =
  {
    response_received: "Response received",
    no_response: "No response",
    declined: "Declined to answer",
    no_record_of_driver: "No record of the driver",
    attempt_failed: "Attempt failed",
  }

const select =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"

/**
 * The investigation file's contact log, shown inside the investigation
 * file's card: every attempt to reach a previous employer, failed ones
 * included. OfficeTruck records these; the owner makes the contact.
 */
export function EmployerChecks({
  driverId,
  checks,
  frozen,
}: {
  driverId: string
  checks: EmployerCheck[]
  frozen: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  // In the Log contact form: the driver had no previous employers to log.
  const [noneMode, setNoneMode] = useState(false)
  const [removing, setRemoving] = useState<EmployerCheck | null>(null)

  async function remove() {
    if (!removing) return
    setPending(true)
    const result = await dqFetch(`employer-checks/${removing.id}/remove`, {
      method: "POST",
    })
    setPending(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("Entry removed.")
    setRemoving(null)
    router.refresh()
  }

  const removeLink = (check: EmployerCheck) =>
    !frozen && (
      <button
        type="button"
        onClick={() => setRemoving(check)}
        className="mt-1 text-xs text-muted-foreground hover:text-destructive hover:underline"
      >
        Remove
      </button>
    )
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const when = String(form.get("contacted_at") ?? "")
    setPending(true)
    const result = await dqFetch(`drivers/${driverId}/employer-checks`, {
      json: noneMode
        ? {
            outcome: NO_PREVIOUS_EMPLOYERS,
            response_summary: form.get("response_summary"),
          }
        : {
            employer_name: form.get("employer_name"),
            employer_address: form.get("employer_address"),
            contacted_at: when ? new Date(when).toISOString() : "",
            method: form.get("method"),
            outcome: form.get("outcome"),
            response_summary: form.get("response_summary"),
          },
    })
    setPending(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(
      noneMode ? "Recorded: no previous employers." : "Contact logged."
    )
    setOpen(false)
    router.refresh()
  }

  return (
    <div className="border-t">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-4 pb-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-medium">Previous-employer contacts</p>
          <p className="text-sm text-muted-foreground">
            Each employer from the past 3 years: when you reached out, how, and
            what they said. Log failed attempts too.
          </p>
        </div>
        {!frozen && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setNoneMode(false)
              setOpen(true)
            }}
          >
            <Plus /> Log contact
          </Button>
        )}
      </div>
      {checks.length === 0 ? (
        <p className="flex items-center gap-2 px-6 pb-4 text-sm text-muted-foreground">
          <PhoneCall className="size-4 shrink-0" />
          No contacts logged yet.
        </p>
      ) : (
        <ul className="divide-y border-t">
          {checks.map((check) =>
            check.outcome === NO_PREVIOUS_EMPLOYERS ? (
              <li key={check.id} className="px-6 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">
                    No previous DOT-regulated employers in the past 3 years
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Recorded{" "}
                    {new Date(check.contacted_at).toLocaleDateString("en-US", {
                      dateStyle: "medium",
                    })}
                  </p>
                </div>
                {check.response_summary && (
                  <p className="text-muted-foreground">
                    {check.response_summary}
                  </p>
                )}
                {removeLink(check)}
              </li>
            ) : (
              <li key={check.id} className="px-6 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{check.employer_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(check.contacted_at).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {check.method && ` · ${METHOD_LABELS[check.method]}`}
                  </p>
                </div>
                <p
                  className={
                    check.outcome === "response_received"
                      ? "text-brand-ink"
                      : "text-muted-foreground"
                  }
                >
                  {OUTCOME_LABELS[check.outcome]}
                  {check.response_summary && `: ${check.response_summary}`}
                </p>
                {removeLink(check)}
              </li>
            )
          )}
        </ul>
      )}
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Log a contact</DialogTitle>
            <DialogDescription>
              One row per attempt. Nothing is sent from OfficeTruck.
            </DialogDescription>
          </DialogHeader>
          <form
            id="dq-employer-check"
            onSubmit={save}
            className="grid gap-4 sm:grid-cols-2"
          >
            {checks.length === 0 && (
              <label className="flex items-start gap-2 rounded-lg border p-3 text-sm has-checked:border-brand has-checked:bg-brand/5 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={noneMode}
                  onChange={(event) => setNoneMode(event.target.checked)}
                  className="mt-0.5 size-4 accent-brand"
                />
                <span>
                  <span className="font-medium">No previous employers</span>
                  <span className="block text-muted-foreground">
                    No DOT-regulated employer in the past 3 years, so there was
                    no one to contact.
                  </span>
                </span>
              </label>
            )}
            {!noneMode && (
              <>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="check-name">Employer</FieldLabel>
                  <Input
                    id="check-name"
                    name="employer_name"
                    required
                    maxLength={200}
                  />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="check-address">Address</FieldLabel>
                  <Input
                    id="check-address"
                    name="employer_address"
                    maxLength={500}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="check-when">When</FieldLabel>
                  <Input
                    id="check-when"
                    name="contacted_at"
                    type="datetime-local"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="check-method">How</FieldLabel>
                  <select
                    id="check-method"
                    name="method"
                    required
                    className={select}
                    defaultValue="phone"
                  >
                    {EMPLOYER_CHECK_METHODS.map((value) => (
                      <option key={value} value={value}>
                        {METHOD_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="check-outcome">What happened</FieldLabel>
                  <select
                    id="check-outcome"
                    name="outcome"
                    required
                    className={select}
                    defaultValue="response_received"
                  >
                    {EMPLOYER_CHECK_OUTCOMES.map((value) => (
                      <option key={value} value={value}>
                        {OUTCOME_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="check-summary">
                {noneMode
                  ? "How you confirmed it (optional)"
                  : "What they said"}
              </FieldLabel>
              <Textarea
                id="check-summary"
                name="response_summary"
                maxLength={noneMode ? 500 : 5000}
                placeholder={
                  noneMode
                    ? "e.g. New CDL holder; see the employment application."
                    : undefined
                }
              />
            </Field>
          </form>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" form="dq-employer-check" disabled={pending}>
              {pending ? "Saving…" : noneMode ? "Record it" : "Log contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={removing !== null}
        onOpenChange={(next) => !pending && !next && setRemoving(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove this entry?</DialogTitle>
            <DialogDescription>
              {removing?.employer_name
                ? `The contact with ${removing.employer_name} leaves the log and the export.`
                : "The entry leaves the log and the export."}{" "}
              It stays in the file&apos;s history, marked removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setRemoving(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => void remove()}
            >
              {pending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
