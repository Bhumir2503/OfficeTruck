"use client"

import { cn } from "cn"
import { ChevronDownIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { reopenLoad, updateLoadStatus } from "@/app/org/[slug]/loads/actions"
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
import { STATUS_STYLES } from "@/lib/load-format"
import {
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

/** The status badge, which opens a menu to move the load to another status. */
export function LoadStatusMenu({
  organizationId,
  load,
}: {
  organizationId: string
  load: { id: string; reference: string; status: LoadStatus }
}) {
  const [pending, setPending] = useState(false)

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
    <DropdownMenu>
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
  )
}
