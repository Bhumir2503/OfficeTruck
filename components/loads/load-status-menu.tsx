"use client"

import { cn } from "cn"
import { ChevronDownIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  cancelLoad,
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
  LOAD_ENDINGS,
  LOAD_FLOW,
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

/** The status badge, which opens a menu to move the load to another status. */
export function LoadStatusMenu({
  organizationId,
  load,
}: {
  organizationId: string
  load: { id: string; reference: string; status: LoadStatus }
}) {
  const [pending, setPending] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // Statuses only move forward, or off the flow to canceled or TONU. Going
  // back is an unassign (on the Dispatch card) or a reopen (here).
  const at = LOAD_FLOW.indexOf(load.status as (typeof LOAD_FLOW)[number])
  const ended = isFallenThrough(load.status)
  const canMoveTo = (status: LoadStatus) =>
    !ended &&
    status !== "dispatched" &&
    LOAD_FLOW.indexOf(status as (typeof LOAD_FLOW)[number]) > at

  async function reopen() {
    setPending(true)
    const result = await reopenLoad(organizationId, load.id)
    setPending(false)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(`Load ${load.reference} reopened. It's back to booked.`)
    }
  }

  async function change(next: LoadStatus) {
    if (next === load.status) {
      return
    }
    // Canceling asks why first.
    if (next === "cancelled") {
      // Close the menu first, or it stays open over the popup and takes its
      // clicks.
      setMenuOpen(false)
      setCanceling(true)
      return
    }
    setPending(true)
    const result = await updateLoadStatus(organizationId, load.id, next)
    setPending(false)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(
        `Load ${load.reference} marked ${LOAD_STATUS_LABELS[next].toLowerCase()}.`
      )
    }
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          disabled={pending}
          aria-label={`Change status of load ${load.reference}`}
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-4xl pr-1.5 pl-2.5 text-xs font-medium whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60",
            STATUS_STYLES[load.status]
          )}
        >
          <span className={cn(isFallenThrough(load.status) && "line-through")}>
            {LOAD_STATUS_LABELS[load.status]}
          </span>
          <ChevronDownIcon className="size-3 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={load.status}
              onValueChange={(value) => change(value as LoadStatus)}
            >
              {LOAD_FLOW.map((status) => (
                <DropdownMenuRadioItem
                  key={status}
                  value={status}
                  disabled={status !== load.status && !canMoveTo(status)}
                >
                  <span className="flex flex-col">
                    <span>{LOAD_STATUS_LABELS[status]}</span>
                    {status === "dispatched" && load.status === "booked" && (
                      <span className="text-xs text-muted-foreground">
                        Use Send to driver
                      </span>
                    )}
                  </span>
                </DropdownMenuRadioItem>
              ))}
              <DropdownMenuSeparator />
              {LOAD_ENDINGS.map((status) => (
                <DropdownMenuRadioItem
                  key={status}
                  value={status}
                  disabled={status !== load.status && ended}
                >
                  {LOAD_STATUS_LABELS[status]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {ended && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={reopen}>
                  Reopen as booked
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuGroup>
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
