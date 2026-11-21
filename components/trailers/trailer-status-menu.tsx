"use client"

import { ChevronDownIcon, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  deleteTrailer,
  setTrailerStatus,
} from "@/app/org/[slug]/trailers/actions"
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
import {
  TRUCK_STATUSES,
  TRUCK_STATUS_LABELS,
  type TruckStatus,
} from "@/lib/schemas/truck"

const HINTS: Record<TruckStatus, string> = {
  active: "In use.",
  out_of_service: "Parked for repairs.",
  inactive: "Sold or returned. Kept on record.",
}

/** Moves a trailer between active, out of service and inactive, or deletes it. */
export function TrailerStatusMenu({
  organizationId,
  trailer,
  listHref,
}: {
  organizationId: string
  trailer: { id: string; unit_number: string; status: TruckStatus }
  /** Where to go after deleting: the trailers list. */
  listHref: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [deleting, setDeleting] = useState(false)

  function change(next: TruckStatus) {
    if (next === trailer.status) return
    start(async () => {
      const result = await setTrailerStatus(organizationId, trailer.id, next)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(
        `${trailer.unit_number} marked ${TRUCK_STATUS_LABELS[next].toLowerCase()}.`
      )
    })
  }

  function remove() {
    start(async () => {
      const result = await deleteTrailer(organizationId, trailer.id)
      if ("error" in result) {
        toast.error(result.error)
        setDeleting(false)
        return
      }
      toast.success(`${trailer.unit_number} deleted.`)
      router.push(listHref)
    })
  }

  return (
    <>
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
              value={trailer.status}
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
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleting(true)}
          >
            <Trash2 />
            Delete trailer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={deleting}
        onOpenChange={(open) => !pending && setDeleting(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {trailer.unit_number}?</DialogTitle>
            <DialogDescription>
              This can&apos;t be undone. To keep it on record, mark it inactive
              instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setDeleting(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={remove}>
              {pending ? "Deleting…" : "Delete trailer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
