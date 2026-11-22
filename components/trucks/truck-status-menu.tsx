"use client"

import { ChevronDownIcon, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { deleteTruck, setTruckStatus } from "@/app/org/[slug]/equipment/actions"
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
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  TRUCK_STATUSES,
  TRUCK_STATUS_LABELS,
  type TruckStatus,
} from "@/lib/schemas/truck"
import type { Truck } from "@/lib/trucks"

const HINTS: Record<TruckStatus, string> = {
  active: "On the road and billed.",
  out_of_service: "Parked for repairs. Not billed.",
  inactive: "Sold or returned. Kept on record.",
}

/**
 * Moves a truck between active, out of service and inactive, and deletes
 * one added by mistake. Out of service asks why and until when.
 */
export function TruckStatusMenu({
  organizationId,
  truck,
  listHref,
}: {
  organizationId: string
  truck: Pick<
    Truck,
    | "id"
    | "unit_number"
    | "status"
    | "out_of_service_reason"
    | "out_of_service_until"
  >
  /** Where to go after deleting: the trucks list. */
  listHref: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [menuOpen, setMenuOpen] = useState(false)
  const [parking, setParking] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reason, setReason] = useState(truck.out_of_service_reason ?? "")
  const [until, setUntil] = useState(truck.out_of_service_until ?? "")

  function change(
    next: TruckStatus,
    details?: { reason: string; until: string }
  ) {
    start(async () => {
      const result = await setTruckStatus(
        organizationId,
        truck.id,
        next,
        details
      )
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      setParking(false)
      toast.success(
        `${truck.unit_number} marked ${TRUCK_STATUS_LABELS[next].toLowerCase()}.`
      )
    })
  }

  function remove() {
    start(async () => {
      const result = await deleteTruck(organizationId, truck.id)
      if ("error" in result) {
        toast.error(result.error)
        setDeleting(false)
        return
      }
      toast.success(`${truck.unit_number} deleted.`)
      router.push(listHref)
    })
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
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
              onValueChange={(value) => {
                // Radio items keep the menu open; close it once one is picked.
                setMenuOpen(false)
                const next = value as TruckStatus
                if (next === "out_of_service") {
                  // Ask why first, even when it's already parked, so the
                  // reason and date can be changed.
                  setParking(true)
                } else if (next !== truck.status) {
                  change(next)
                }
              }}
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
            Delete truck
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={parking}
        onOpenChange={(open) => !pending && setParking(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Out of service</DialogTitle>
            <DialogDescription>
              {truck.unit_number} stops being billed and its dates stop being
              flagged until it&apos;s active again.
            </DialogDescription>
          </DialogHeader>
          <form
            id="truck-out-of-service"
            className="grid gap-4 sm:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault()
              change("out_of_service", { reason, until })
            }}
          >
            <Field className="sm:col-span-3">
              <FieldLabel htmlFor="truck-oos-reason">Reason</FieldLabel>
              <Input
                id="truck-oos-reason"
                placeholder="e.g. Engine repair at Rush"
                maxLength={200}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="truck-oos-until">Back by</FieldLabel>
              <Input
                id="truck-oos-until"
                type="date"
                value={until}
                onChange={(event) => setUntil(event.target.value)}
              />
            </Field>
          </form>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setParking(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="truck-out-of-service"
              disabled={pending}
            >
              {pending ? "Saving…" : "Mark out of service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleting}
        onOpenChange={(open) => !pending && setDeleting(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {truck.unit_number}?</DialogTitle>
            <DialogDescription>
              For a truck added by mistake. Its documents and maintenance log
              are deleted too, and this can&apos;t be undone. A truck that has
              run loads can&apos;t be deleted; mark it inactive instead.
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
              {pending ? "Deleting…" : "Delete truck"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
