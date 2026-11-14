"use client"

import { cn } from "cn"
import { ChevronDownIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  cancelLoad,
  markLoadComplete,
  reopenLoad,
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useZodForm } from "@/hooks/use-zod-form"
import { STATUS_STYLES } from "@/lib/load-format"
import {
  cancelLoadSchema,
  isFallenThrough,
  LOAD_STATUS_LABELS,
  type LoadStatus,
} from "@/lib/schemas/load"

export function LoadStatusBadge({
  status,
  className,
}: {
  status: LoadStatus
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
      {LOAD_STATUS_LABELS[status]}
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

/** An action in the status menu: what it does to the load. */
type StatusAction =
  | { kind: "complete" }
  | { kind: "status"; to: LoadStatus; label: string }
  | { kind: "cancel" }
  | { kind: "reopen" }

/**
 * What the office can do from a status. Everything else moves on its own:
 * Dispatched from Save and notify, In transit and Delivered from the BOL,
 * POD and check-ins. Invoiced and Paid are manual until invoicing and
 * payments are built.
 */
function actionsFor(status: LoadStatus): StatusAction[][] {
  const end: StatusAction[] = [
    { kind: "cancel" },
    { kind: "status", to: "tonu", label: "Truck ordered, not used (TONU)" },
  ]
  switch (status) {
    case "booked":
      return [[{ kind: "complete" }], end]
    case "dispatched":
    case "loaded":
      return [[{ kind: "complete" }], end]
    case "delivered":
      return [[{ kind: "status", to: "invoiced", label: "Mark invoiced" }], end]
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
}: {
  organizationId: string
  load: {
    id: string
    reference: string
    status: LoadStatus
    /** Marked complete by hand, with no POD or last-stop check-in yet. */
    completed_manually?: boolean
  }
}) {
  const [pending, setPending] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const groups = actionsFor(load.status)
  // Marked complete by hand and still waiting on proof: "Completed" instead
  // of "Delivered". Past delivered (invoiced, paid) the usual name shows.
  const manual = !!load.completed_manually && load.status === "delivered"
  const statusLabel = manual ? "Completed" : LOAD_STATUS_LABELS[load.status]

  async function run(action: StatusAction) {
    if (action.kind === "cancel") {
      // Close the menu first, or it stays open over the popup and takes its
      // clicks.
      setMenuOpen(false)
      setCanceling(true)
      return
    }
    setPending(true)
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
      : action.kind === "cancel"
        ? "Cancel load…"
        : action.kind === "reopen"
          ? "Reopen as booked"
          : action.label

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          disabled={pending || groups.length === 0}
          aria-label={`Status of load ${load.reference}: ${statusLabel}${manual ? ", marked complete by hand" : ""}`}
          title={
            manual
              ? "Marked complete by hand. No POD or check-in yet."
              : undefined
          }
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-4xl pr-1.5 pl-2.5 text-xs font-medium whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-100",
            STATUS_STYLES[load.status],
            groups.length === 0 && "pr-2.5"
          )}
        >
          <span className={cn(isFallenThrough(load.status) && "line-through")}>
            {statusLabel}
          </span>
          {groups.length > 0 && (
            <ChevronDownIcon className="size-3 opacity-70" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-52">
          {groups.map((group, index) => (
            <DropdownMenuGroup key={index}>
              {index > 0 && <DropdownMenuSeparator />}
              {index === 0 && (
                <DropdownMenuLabel className="font-normal text-muted-foreground">
                  {load.status === "dispatched" || load.status === "loaded"
                    ? "Moves on its own from the BOL, POD and check-ins"
                    : "Actions"}
                </DropdownMenuLabel>
              )}
              {group.map((action) => (
                <DropdownMenuItem
                  key={label(action)}
                  variant={action.kind === "cancel" ? "destructive" : undefined}
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
    </>
  )
}
