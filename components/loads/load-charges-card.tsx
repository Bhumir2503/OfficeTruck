"use client"

import { cn } from "cn"
import { FilePenLine, History, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  addAccessorial,
  removeAccessorial,
  reviewRateVersion,
  reviseLoadRate,
} from "@/app/org/[slug]/loads/actions"
import { ChargesEditor } from "@/components/loads/charges-editor"
import { LoadTextField } from "@/components/loads/freight-fields"
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
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  handleCurrencyBlur,
  handleCurrencyInput,
  handleCurrencyKeyDown,
} from "@/lib/currency"
import { formatRate } from "@/lib/load-format"
import type { Load, LoadCharge, RateVersion } from "@/lib/loads"
import {
  ACCESSORIAL_KINDS,
  accessorialSchema,
  CHARGE_KIND_LABELS,
  rateRevisionSchema,
} from "@/lib/schemas/load"

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function terms(free: number | null, rate: number | null) {
  return free === null || rate === null
    ? "No detention terms"
    : `Detention ${formatRate(rate)}/h after ${Number(free)} free ${Number(free) === 1 ? "hour" : "hours"}`
}

function ChargeLine({
  label,
  note,
  amount,
  action,
  muted,
}: {
  label: string
  note?: string | null
  amount: number
  action?: React.ReactNode
  muted?: boolean
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-6 py-2.5 text-sm">
      <div className="min-w-0">
        <span className={cn("font-medium", muted && "font-normal")}>
          {label}
        </span>
        {note && <span className="text-muted-foreground"> · {note}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="tabular-nums">{formatRate(amount)}</span>
        {action}
      </div>
    </li>
  )
}

function ReviseForm({
  organizationId,
  load,
  charges,
  onDone,
}: {
  organizationId: string
  load: Pick<Load, "id" | "detention_free_hours" | "detention_rate">
  charges: LoadCharge[]
  onDone: () => void
}) {
  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    rateRevisionSchema,
    async (values) => {
      const result = await reviseLoadRate(organizationId, load.id, values)
      if ("error" in result) {
        return result.error
      }
      toast.success("Rate con charges updated as a new version.")
      onDone()
    }
  )

  return (
    <form {...formProps} autoComplete="off">
      <fieldset disabled={pending} className="flex flex-col gap-6">
        <ChargesEditor
          defaultCharges={charges}
          defaultDetention={{
            free_hours: load.detention_free_hours,
            rate: load.detention_rate,
          }}
          errors={errors}
          onUpdate={revalidate}
        />
        <LoadTextField
          name="note"
          label="What changed"
          placeholder="e.g. Revised rate con from Jen, added a stop-off"
          errors={errors}
        />
        <DialogFooter className="items-center">
          {formError && (
            <p className="mr-auto text-sm text-destructive">{formError}</p>
          )}
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save new version"}
          </Button>
        </DialogFooter>
      </fieldset>
    </form>
  )
}

function AccessorialForm({
  organizationId,
  loadId,
  onDone,
}: {
  organizationId: string
  loadId: string
  onDone: () => void
}) {
  const [kind, setKind] = useState<string>("lumper")
  const { errors, formError, pending, formProps } = useZodForm(
    accessorialSchema,
    async (values) => {
      const result = await addAccessorial(organizationId, loadId, values)
      if ("error" in result) {
        return result.error
      }
      toast.success(`${CHARGE_KIND_LABELS[values.kind]} added.`)
      onDone()
    }
  )

  return (
    <form {...formProps} autoComplete="off">
      <fieldset disabled={pending} className="flex flex-col gap-5">
        <input type="hidden" name="kind" value={kind} />
        <Field>
          <FieldLabel htmlFor="accessorial-kind">Charge</FieldLabel>
          <Select
            value={kind}
            onValueChange={(value) => setKind((value as string) ?? "lumper")}
            items={ACCESSORIAL_KINDS.map((value) => ({
              value,
              label: CHARGE_KIND_LABELS[value],
            }))}
          >
            <SelectTrigger id="accessorial-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCESSORIAL_KINDS.map((value) => (
                <SelectItem key={value} value={value}>
                  {CHARGE_KIND_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <LoadTextField
          name="description"
          label="Note"
          placeholder="Optional, e.g. Receipt #2231"
          errors={errors}
        />
        <LoadTextField
          name="amount"
          label="Amount"
          prefix="$"
          inputMode="decimal"
          placeholder="0.00"
          errors={errors}
          onChange={handleCurrencyInput}
          onKeyDown={handleCurrencyKeyDown}
          onBlur={handleCurrencyBlur}
        />
        <DialogFooter className="items-center">
          {formError && (
            <p className="mr-auto text-sm text-destructive">{formError}</p>
          )}
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add charge"}
          </Button>
        </DialogFooter>
      </fieldset>
    </form>
  )
}

/** A version waiting for a person to approve it, next to what's on the load now. */
function PendingVersion({
  organizationId,
  version,
  currentTotal,
}: {
  organizationId: string
  version: RateVersion
  currentTotal: number
}) {
  const [pending, setPending] = useState(false)

  async function review(approve: boolean) {
    setPending(true)
    const result = await reviewRateVersion(organizationId, version.id, approve)
    setPending(false)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(
        approve ? `Version ${version.version} approved.` : "Version rejected."
      )
    }
  }

  return (
    <div
      role="status"
      className="mx-6 mb-4 flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
    >
      <div>
        <p className="font-medium">
          Revised rate con waiting for review (version {version.version})
        </p>
        <p className="text-muted-foreground">
          {formatRate(version.total)} instead of {formatRate(currentTotal)}.{" "}
          {terms(version.detention_free_hours, version.detention_rate)}.
          {version.note && ` ${version.note}`}
        </p>
      </div>
      <ul className="space-y-1">
        {version.charges.map((charge, index) => (
          <li key={index} className="flex justify-between gap-3">
            <span>
              {CHARGE_KIND_LABELS[charge.kind]}
              {charge.description && (
                <span className="text-muted-foreground">
                  {" "}
                  · {charge.description}
                </span>
              )}
            </span>
            <span className="tabular-nums">{formatRate(charge.amount)}</span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => review(true)}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => review(false)}
        >
          Reject
        </Button>
      </div>
    </div>
  )
}

/**
 * The load's charges: the rate con lines (changed only by a new version a
 * person approves) and accessorials added after booking.
 */
export function LoadChargesCard({
  organizationId,
  load,
  charges,
  versions,
}: {
  organizationId: string
  load: Pick<Load, "id" | "rate" | "detention_free_hours" | "detention_rate">
  charges: LoadCharge[]
  versions: RateVersion[]
}) {
  // Kept after closing, so the dialog doesn't switch forms as it fades out.
  const [dialog, setDialog] = useState<"revise" | "accessorial">("revise")
  const [open, setOpen] = useState(false)
  const show = (which: "revise" | "accessorial") => {
    setDialog(which)
    setOpen(true)
  }
  const [removing, setRemoving] = useState<string | null>(null)
  const rateCon = charges.filter((charge) => charge.source === "rate_con")
  const accessorials = charges.filter(
    (charge) => charge.source === "accessorial"
  )
  const pendingVersion = versions.find(
    (version) => version.status === "pending"
  )
  const current = versions.find((version) => version.status === "approved")

  async function remove(charge: LoadCharge) {
    setRemoving(charge.id)
    const result = await removeAccessorial(organizationId, charge.id)
    setRemoving(null)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(`${CHARGE_KIND_LABELS[charge.kind]} removed.`)
    }
  }

  return (
    <SettingsCard
      title="Charges"
      description={terms(load.detention_free_hours, load.detention_rate)}
      action={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => show("accessorial")}
          >
            <Plus />
            Accessorial
          </Button>
          <Button variant="outline" size="sm" onClick={() => show("revise")}>
            <FilePenLine />
            Revise rate con
          </Button>
        </div>
      }
      contentClassName="px-0 pb-0"
      footer={
        <SettingsCardFooter
          hint={
            current
              ? `Rate con version ${current.version}, ${dateFormat.format(new Date(current.reviewed_at ?? current.created_at))}. Only a person can change an amount.`
              : "Only a person can change an amount."
          }
        />
      }
    >
      {pendingVersion && (
        <PendingVersion
          organizationId={organizationId}
          version={pendingVersion}
          currentTotal={Number(load.rate)}
        />
      )}
      <ul className="border-t">
        <li className="px-6 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Rate con
        </li>
        {rateCon.map((charge) => (
          <ChargeLine
            key={charge.id}
            label={CHARGE_KIND_LABELS[charge.kind]}
            note={charge.description}
            amount={charge.amount}
          />
        ))}
        {accessorials.length > 0 && (
          <li className="px-6 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Accessorials
          </li>
        )}
        {accessorials.map((charge) => (
          <ChargeLine
            key={charge.id}
            label={CHARGE_KIND_LABELS[charge.kind]}
            note={charge.description}
            amount={charge.amount}
            action={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${CHARGE_KIND_LABELS[charge.kind].toLowerCase()}`}
                disabled={removing !== null}
                onClick={() => remove(charge)}
              >
                <Trash2 />
              </Button>
            }
          />
        ))}
        <li className="mt-1 flex items-center justify-between gap-3 border-t px-6 py-3 text-sm">
          <span className="font-semibold">Total</span>
          <span
            className={cn(
              "font-semibold tabular-nums",
              accessorials.length > 0 && "mr-8"
            )}
          >
            {formatRate(load.rate)}
          </span>
        </li>
      </ul>
      {versions.length > 1 && (
        <details className="group border-t px-6 py-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground hover:text-foreground">
            <History className="size-4" />
            {versions.length} rate con versions
          </summary>
          <ol className="mt-3 space-y-2">
            {versions.map((version) => (
              <li key={version.id} className="flex justify-between gap-3">
                <span>
                  Version {version.version}
                  <span className="text-muted-foreground">
                    {" "}
                    · {version.status} ·{" "}
                    {dateFormat.format(new Date(version.created_at))}
                    {version.note && ` · ${version.note}`}
                  </span>
                </span>
                <span
                  className={cn(
                    "tabular-nums",
                    version.status === "rejected" &&
                      "text-muted-foreground line-through"
                  )}
                >
                  {formatRate(version.total)}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={dialog === "revise" ? "sm:max-w-2xl" : "sm:max-w-md"}
        >
          <DialogHeader>
            <DialogTitle>
              {dialog === "revise" ? "Revise rate con" : "Add an accessorial"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "revise"
                ? "Enter the charges from the revised rate con. They replace the rate con lines and are kept as a new version."
                : "A charge run up on the road, like a lumper or detention."}
            </DialogDescription>
          </DialogHeader>
          {dialog === "revise" ? (
            <ReviseForm
              organizationId={organizationId}
              load={load}
              charges={rateCon}
              onDone={() => setOpen(false)}
            />
          ) : (
            <AccessorialForm
              organizationId={organizationId}
              loadId={load.id}
              onDone={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </SettingsCard>
  )
}
