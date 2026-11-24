"use client"

import { CheckCircle2, PhoneCall, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { dqFetch } from "@/components/dq/dq-api"
import {
  SettingsCard,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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

  const removeButton = (check: EmployerCheck, label: string) =>
    !frozen && (
      <Button
        variant="ghost"
        size="icon-sm"
        className="hover:text-destructive"
        aria-label={`Remove ${label}`}
        onClick={() => setRemoving(check)}
      >
        <Trash2 />
      </Button>
    )
  const contacted = (check: EmployerCheck) =>
    new Date(check.contacted_at).toLocaleDateString("en-US", {
      dateStyle: "medium",
    })
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
    <SettingsCard
      title="Previous-employer contacts"
      description="Each employer from the past 3 years: when you reached out, how, and what they said. Log failed attempts too."
      contentClassName={checks.length ? "px-0 pb-0" : undefined}
      action={
        !frozen && (
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
        )
      }
    >
      {checks.length === 0 ? (
        <SettingsEmptyState icon={PhoneCall} title="No contacts logged yet">
          Log each previous employer you reach out to, or record that there
          weren&apos;t any.
        </SettingsEmptyState>
      ) : (
        <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="w-full">Employer</TableHead>
              <TableHead className="hidden w-px whitespace-nowrap sm:table-cell">
                Contacted
              </TableHead>
              <TableHead className="w-px">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {checks.map((check) => {
              const none = check.outcome === NO_PREVIOUS_EMPLOYERS
              const name = none
                ? "No previous DOT-regulated employers"
                : (check.employer_name ?? "Employer")
              return (
                <TableRow key={check.id}>
                  <TableCell className="py-3 whitespace-normal">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={
                          none || check.outcome === "response_received"
                            ? "flex size-8 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand"
                            : "flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                        }
                      >
                        {none ? (
                          <CheckCircle2 className="size-4" aria-hidden />
                        ) : (
                          <PhoneCall className="size-4" aria-hidden />
                        )}
                      </span>
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-medium">{name}</p>
                        <p className="text-xs text-muted-foreground">
                          {check.outcome === NO_PREVIOUS_EMPLOYERS
                            ? "In the past 3 years"
                            : [
                                OUTCOME_LABELS[check.outcome],
                                check.method && METHOD_LABELS[check.method],
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                          {/* The date column is hidden on a phone. */}
                          <span className="sm:hidden">
                            {" · "}
                            {contacted(check)}
                          </span>
                        </p>
                        {check.response_summary && (
                          <p className="text-xs">{check.response_summary}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden py-3 align-top text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:table-cell">
                    {contacted(check)}
                  </TableCell>
                  <TableCell className="py-3 align-top">
                    <div className="flex justify-end">
                      {removeButton(check, name)}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
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
    </SettingsCard>
  )
}
