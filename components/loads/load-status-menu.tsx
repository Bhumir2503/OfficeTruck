"use client"

import { cn } from "cn"
import { ChevronDownIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { updateLoadStatus } from "@/app/org/[slug]/loads/actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
              <DropdownMenuRadioItem key={status} value={status}>
                {LOAD_STATUS_LABELS[status]}
              </DropdownMenuRadioItem>
            ))}
            <DropdownMenuSeparator />
            {LOAD_ENDINGS.map((status) => (
              <DropdownMenuRadioItem key={status} value={status}>
                {LOAD_STATUS_LABELS[status]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
