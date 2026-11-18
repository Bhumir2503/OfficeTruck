"use client"

import { PhoneCall, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { dqFetch } from "@/components/dq/dq-api"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
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
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  EMPLOYER_CHECK_METHODS,
  EMPLOYER_CHECK_OUTCOMES,
} from "@/lib/schemas/dq"

export type EmployerCheck = {
  id: string
  employer_name: string
  employer_address: string | null
  contacted_at: string
  method: (typeof EMPLOYER_CHECK_METHODS)[number]
  outcome: (typeof EMPLOYER_CHECK_OUTCOMES)[number]
  response_summary: string | null
}

const METHOD_LABELS: Record<EmployerCheck["method"], string> = {
  phone: "Phone",
  email: "Email",
  fax: "Fax",
  mail: "Mail",
  in_person: "In person",
  other: "Other",
}

const OUTCOME_LABELS: Record<EmployerCheck["outcome"], string> = {
  response_received: "Response received",
  no_response: "No response",
  declined: "Declined to answer",
  no_record_of_driver: "No record of the driver",
  attempt_failed: "Attempt failed",
}

const select =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"

/**
 * The investigation file's contact log: every attempt to reach a previous
 * employer, failed ones included. OfficeTruck records these; the owner
 * makes the contact.
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

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const when = String(form.get("contacted_at") ?? "")
    setPending(true)
    const result = await dqFetch(`drivers/${driverId}/employer-checks`, {
      json: {
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
    toast.success("Contact logged.")
    setOpen(false)
    router.refresh()
  }

  return (
    <SettingsCard
      title="Previous-employer contacts"
      description="Each employer from the past 3 years: when you reached out, how, and what they said. Log failed attempts too."
      contentClassName={checks.length ? "px-0 pb-0" : undefined}
      action={
        !frozen && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus /> Log contact
          </Button>
        )
      }
      footer={
        <SettingsCardFooter hint="Only owners and admins can see this log." />
      }
    >
      {checks.length === 0 ? (
        <SettingsEmptyState icon={PhoneCall} title="No contacts logged">
          Log each call, email or fax to a previous employer, even when no one
          answers.
        </SettingsEmptyState>
      ) : (
        <ul className="divide-y border-t">
          {checks.map((check) => (
            <li key={check.id} className="px-6 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{check.employer_name}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(check.contacted_at).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {" · "}
                  {METHOD_LABELS[check.method]}
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
            </li>
          ))}
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
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="check-summary">What they said</FieldLabel>
              <Textarea
                id="check-summary"
                name="response_summary"
                maxLength={5000}
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
              {pending ? "Saving…" : "Log contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  )
}
