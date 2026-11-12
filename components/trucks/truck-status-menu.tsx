"use client"

import { ChevronDownIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { setTruckStatus } from "@/app/org/[slug]/equipment/actions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  TRUCK_STATUSES,
  TRUCK_STATUS_LABELS,
  type TruckStatus,
} from "@/lib/schemas/truck"

const HINTS: Record<TruckStatus, string> = {
  active: "On the road and billed.",
  out_of_service: "Parked for repairs. Not billed.",
  inactive: "Sold or returned. Kept on record.",
}

/** Moves a truck between active, out of service and inactive. */
export function TruckStatusMenu({
  organizationId,
  truck,
}: {
  organizationId: string
  truck: { id: string; unit_number: string; status: TruckStatus }
}) {
  const [pending, setPending] = useState(false)

  async function change(next: TruckStatus) {
    if (next === truck.status) {
      return
    }
    setPending(true)
    const result = await setTruckStatus(organizationId, truck.id, next)
    setPending(false)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(
        `${truck.unit_number} marked ${TRUCK_STATUS_LABELS[next].toLowerCase()}.`
      )
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        render={<Button variant="outline" size="sm" />}
      >
        {pending ? "Saving…" : "Change status"}
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={truck.status}
            onValueChange={(value) => change(value as TruckStatus)}
          >
            {TRUCK_STATUSES.map((status) => (
              <DropdownMenuRadioItem key={status} value={status}>
                <div className="flex flex-col">
                  <span>{TRUCK_STATUS_LABELS[status]}</span>
                  <span className="text-xs text-muted-foreground">
                    {HINTS[status]}
                  </span>
                </div>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
