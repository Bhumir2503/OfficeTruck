"use client"

import { cn } from "cn"
import { ChevronDownIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  cancelLoad,
  deleteLoad,
  markLoadComplete,
  markLoadTonu,
  reopenLoad,
  unmarkLoadComplete,
  updateLoadStatus,
} from "@/app/org/[slug]/loads/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LoadTextField } from "@/components/loads/freight-fields"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  handleCurrencyBlur,
  handleCurrencyInput,
  handleCurrencyKeyDown,
} from "@/lib/currency"
import { formatRate, STATUS_STYLES } from "@/lib/load-format"
import {
  cancelLoadSchema,
  isFallenThrough,
  LOAD_STATUS_LABELS,
  type LoadStatus,
  tonuSchema,
} from "@/lib/schemas/load"

export function LoadStatusBadge({
  status,
  label,
  className,
}: {
  status: LoadStatus
  /** In place of the status's name, e.g. "Completed". */
  label?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-4xl px-2.5 text-xs font-medium whitespace-nowrap",
        STATUS_STYLES[status],
        isFallenThrough(status) && "line-through",
        className
      )}
    >
      {label ?? LOAD_STATUS_LABELS[status]}
    </span>
  )
}

/** Common reasons, to fill the box in one tap. */
const CANCEL_REASONS = [
  "Broker canceled",
  "Shipper canceled",
  "Truck broke down",
  "No driver available",
]

// Lives inside the dialog content so it starts empty each time it opens.
function CancelForm({
  organizationId,
  load,
  onDone,
}: {
  organizationId: string
  load: { id: string; reference: string }
  onDone: () => void
}) {
  const [reason, setReason] = useState("")
  const formRef = useRef<HTMLFormElement>(null)
  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    cancelLoadSchema,
    async (values) => {
      const result = await cancelLoad(organizationId, load.id, values)
      if ("error" in result) {
        return result.error
      }
      toast.success(`Load ${load.reference} canceled.`)
      onDone()
    }
  )

  // A reason chip sets the text from state, which fires no change event.
  useEffect(() => {
    revalidate(formRef.current)
    // Only when the text changes; revalidate is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason])

  return (
    <form ref={formRef} {...formProps}>
      <fieldset disabled={pending} className="flex flex-col gap-5">
        <Field data-invalid={!!errors.reason}>
          <FieldLabel htmlFor="cancel-reason">Reason</FieldLabel>
          <Textarea
            id="cancel-reason"
            name="reason"
            rows={3}
            autoFocus
            maxLength={500}
            placeholder="e.g. Broker canceled, load was covered by another carrier"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={!!errors.reason}
          />
          <div className="flex flex-wrap gap-1.5">
            {CANCEL_REASONS.map((text) => (
              <Button
                key={text}
                type="button"
                size="xs"
                variant="outline"
                onClick={() => setReason(text)}
              >
                {text}
              </Button>
            ))}
          </div>
          <FieldError errors={errors.reason} />
        </Field>
        <DialogFooter className="items-center">
          {formError && (
            <p className="mr-auto text-sm text-destructive">{formError}</p>
          )}
          <Button type="button" variant="outline" onClick={onDone}>
            Keep load
          </Button>
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? "Canceling…" : "Cancel load"}
          </Button>
        </DialogFooter>
      </fieldset>
    </form>
  )
}

// Lives inside the dialog content so it starts empty each time it opens.
function TonuForm({
  organizationId,
  load,
  onDone,
}: {
  organizationId: string
  load: { id: string; reference: string; hasDriver: boolean }
  onDone: () => void
}) {
  const { errors, formError, pending, formProps } = useZodForm(
    tonuSchema,
    async (values) => {
      const result = await markLoadTonu(organizationId, load.id, values)
      if ("error" in result) {
        return result.error
      }
      toast.success(
        `Load ${load.reference} marked TONU, with a ${formatRate(values.amount ?? 0)} TONU charge.`
      )
      onDone()
    }
  )

  return (
    <form {...formProps} autoComplete="off">
      <fieldset disabled={pending} className="flex flex-col gap-5">
        <LoadTextField
          name="amount"
          label="TONU amount"
          prefix="$"
          inputMode="decimal"
          placeholder="e.g. 150.00"
          autoFocus
          errors={errors}
          onChange={handleCurrencyInput}
          onKeyDown={handleCurrencyKeyDown}
          onBlur={handleCurrencyBlur}
        />
        <LoadTextField
          name="description"
          label="Note"
          placeholder="Optional, e.g. Shipper canceled at the dock"
          errors={errors}
        />
        {load.hasDriver && (
          <LoadTextField
            name="driver_pay"
            label="Driver's TONU pay"
            prefix="$"
            inputMode="decimal"
            placeholder="Company default"
            hint="For the wasted trip. Leave it blank for the amount in Settings, or enter 0."
            errors={errors}
            onChange={handleCurrencyInput}
            onKeyDown={handleCurrencyKeyDown}
            onBlur={handleCurrencyBlur}
          />
        )}
        <DialogFooter className="items-center">
          {formError && (
            <p className="mr-auto text-sm text-destructive">{formError}</p>
          )}
          <Button type="button" variant="outline" onClick={onDone}>
            Keep load
          </Button>
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? "Saving…" : "Mark TONU"}
          </Button>
        </DialogFooter>
      </fieldset>
    </form>
  )
}

/** An action in the status menu: what it does to the load. */
type StatusAction =
  | { kind: "complete" }
  | { kind: "uncomplete" }
  | { kind: "status"; to: LoadStatus; label: string }
  | { kind: "cancel" }
  | { kind: "tonu" }
  | { kind: "reopen" }

/**
 * What the office can do from a status. Everything else moves on its own:
 * Dispatched from Save and dispatch, In transit and Delivered from the BOL,
 * POD and stop times. Invoiced and Paid are manual until invoicing and
 * payments are built.
 */
function actionsFor(status: LoadStatus, manual: boolean): StatusAction[][] {
  const end: StatusAction[] = [{ kind: "cancel" }, { kind: "tonu" }]
  switch (status) {
    case "booked":
      return [[{ kind: "complete" }], end]
    case "dispatched":
    case "loaded":
      return [[{ kind: "complete" }], end]
    case "delivered":
      return [
        [
          ...(manual ? [{ kind: "uncomplete" } as const] : []),
          { kind: "status", to: "invoiced", label: "Mark invoiced" },
        ],
        end,
      ]
    case "invoiced":
      return [
        [
          { kind: "status", to: "paid", label: "Mark paid" },
          { kind: "status", to: "factored", label: "Mark factored" },
        ],
      ]
    case "cancelled":
    case "tonu":
      return [[{ kind: "reopen" }]]
    default:
      return []
  }
}

/**
 * The status badge. Statuses move on their own; the badge opens the few
 * things the office does by hand, like Mark complete, which shows as
 * "Completed" until real proof of delivery arrives.
 */
export function LoadStatusMenu({
  organizationId,
  load,
  canDelete = false,
  listHref,
  trigger = "badge",
}: {
  organizationId: string
  /**
   * The badge itself opens the menu (the loads list), or a Change status
   * button beside the badge does (the load page's header).
   */
  trigger?: "badge" | "button"
  /** Owners and admins can delete a load entered by mistake. */
  canDelete?: boolean
  /** Where to go once it's deleted: the loads list. */
  listHref?: string
  load: {
    id: string
    reference: string
    status: LoadStatus
    /** Marked complete by hand, with no POD or last-stop check-in yet. */
    completed_manually?: boolean
    /** A load with a driver asks for their TONU pay when marked TONU. */
    driver_id?: string | null
  }
}) {
  const [pending, setPending] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [markingTonu, setMarkingTonu] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const router = useRouter()
  // Marked complete by hand and still waiting on proof: "Completed" instead
  // of "Delivered". Past delivered (invoiced, paid) the usual name shows.
  const manual = !!load.completed_manually && load.status === "delivered"
  const statusLabel = manual ? "Completed" : LOAD_STATUS_LABELS[load.status]
  const groups = actionsFor(load.status, manual)
  const hasMenu = groups.length > 0 || canDelete

  async function remove() {
    setPending(true)
    const result = await deleteLoad(organizationId, load.id)
    setPending(false)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    setDeleting(false)
    toast.success(`Load ${result.reference} deleted.`)
    if (listHref) router.push(listHref)
  }

  async function run(action: StatusAction) {
    if (action.kind === "cancel") {
      // Close the menu first, or it stays open over the popup and takes its
      // clicks.
      setMenuOpen(false)
      setCanceling(true)
      return
    }
    if (action.kind === "tonu") {
      setMenuOpen(false)
      setMarkingTonu(true)
      return
    }
    setPending(true)
    if (action.kind === "uncomplete") {
      const undone = await unmarkLoadComplete(organizationId, load.id)
      setPending(false)
      if ("error" in undone) {
        toast.error(undone.error)
      } else {
        toast.success(
          `Completion undone. Load ${load.reference} is back to ${LOAD_STATUS_LABELS[undone.status].toLowerCase()}.`
        )
      }
      return
    }
    const result =
      action.kind === "reopen"
        ? await reopenLoad(organizationId, load.id)
        : action.kind === "complete"
          ? await markLoadComplete(organizationId, load.id)
          : await updateLoadStatus(organizationId, load.id, action.to)
    setPending(false)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success(
      action.kind === "reopen"
        ? `Load ${load.reference} reopened. It's back to booked.`
        : action.kind === "complete"
          ? `Load ${load.reference} marked complete. It shows as Completed until the POD comes in.`
          : `Load ${load.reference} marked ${LOAD_STATUS_LABELS[action.to].toLowerCase()}.`
    )
  }

  const label = (action: StatusAction) =>
    action.kind === "complete"
      ? "Mark complete"
      : action.kind === "uncomplete"
        ? "Undo complete"
        : action.kind === "cancel"
          ? "Cancelled"
          : action.kind === "tonu"
            ? "TONU"
            : action.kind === "reopen"
              ? "Reopen as booked"
              : action.label

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        {trigger === "button" ? (
          hasMenu && (
            <DropdownMenuTrigger
              disabled={pending}
              render={<Button variant="outline" size="sm" className="w-fit" />}
            >
              Change status
              <ChevronDownIcon />
            </DropdownMenuTrigger>
          )
        ) : (
          <DropdownMenuTrigger
            disabled={pending || !hasMenu}
            aria-label={`Status of load ${load.reference}: ${statusLabel}${manual ? ", marked complete by hand" : ""}`}
            title={
              manual
                ? "Marked complete by hand. No POD or last stop time yet."
                : undefined
            }
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-4xl pr-1.5 pl-2.5 text-xs font-medium whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-100",
              STATUS_STYLES[load.status],
              !hasMenu && "pr-2.5"
            )}
          >
            <span
              className={cn(isFallenThrough(load.status) && "line-through")}
            >
              {statusLabel}
            </span>
            {hasMenu && <ChevronDownIcon className="size-3 opacity-70" />}
          </DropdownMenuTrigger>
        )}
        <DropdownMenuContent
          align={trigger === "button" ? "end" : "start"}
          className="min-w-52"
        >
          {groups.map((group, index) => (
            <DropdownMenuGroup key={index}>
              {index > 0 && <DropdownMenuSeparator />}
              {index === 0 && (
                <DropdownMenuLabel className="font-normal text-muted-foreground">
                  {load.status === "dispatched" || load.status === "loaded"
                    ? "Moves on its own from the BOL, POD and stop times"
                    : "Actions"}
                </DropdownMenuLabel>
              )}
              {group.map((action) => (
                <DropdownMenuItem
                  key={label(action)}
                  variant={
                    action.kind === "cancel" || action.kind === "tonu"
                      ? "destructive"
                      : undefined
                  }
                  onClick={() => void run(action)}
                >
                  {action.kind === "complete" ? (
                    <span className="flex flex-col">
                      <span>Mark complete</span>
                      <span className="text-xs text-muted-foreground">
                        Delivered, marked by hand
                      </span>
                    </span>
                  ) : (
                    label(action)
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
          {canDelete && (
            <DropdownMenuGroup>
              {groups.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  // Close the menu first, or it stays open over the popup.
                  setMenuOpen(false)
                  setDeleting(true)
                }}
              >
                Delete load
              </DropdownMenuItem>
            </DropdownMenuGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={canceling} onOpenChange={setCanceling}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel load {load.reference}?</DialogTitle>
            <DialogDescription>
              Say why it fell through. It&apos;s kept on the load and in its
              history. You can reopen it later.
            </DialogDescription>
          </DialogHeader>
          <CancelForm
            organizationId={organizationId}
            load={load}
            onDone={() => setCanceling(false)}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete load {load.reference}?</DialogTitle>
            <DialogDescription>
              Its stops, check-ins, charges, paperwork and expenses are deleted
              too, and this can&apos;t be undone. A load with an invoice
              can&apos;t be deleted until the invoice is voided, and one on a
              paid pay statement stays: cancel that one instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setDeleting(false)}
            >
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => void remove()}
            >
              {pending ? "Deleting…" : "Delete load"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={markingTonu} onOpenChange={setMarkingTonu}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark load {load.reference} TONU?</DialogTitle>
            <DialogDescription>
              Truck ordered, not used. Enter what the broker owes for it. The
              invoice bills the TONU instead of the linehaul, and the driver
              isn&apos;t paid for the miles. Reopening the load puts the rate
              con charges back.
            </DialogDescription>
          </DialogHeader>
          <TonuForm
            organizationId={organizationId}
            load={{ ...load, hasDriver: !!load.driver_id }}
            onDone={() => setMarkingTonu(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
