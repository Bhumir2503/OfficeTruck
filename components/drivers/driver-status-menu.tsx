"use client"

import { ChevronDownIcon, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { deleteDriver, setDriverStatus } from "@/app/org/[slug]/drivers/actions"
import { dqFetch } from "@/components/dq/dq-api"
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { DatePicker } from "@/components/ui/date-picker"
import { formatDate } from "@/lib/driver-format"
import {
  DRIVER_STATUSES,
  DRIVER_STATUS_LABELS,
  type DriverStatus,
} from "@/lib/schemas/driver"

const HINTS: Record<DriverStatus, string> = {
  active: "Driving for you. Their dates are watched.",
  inactive: "No longer driving. Kept on record.",
}

/** "2026-11-30" → "2029-11-30": the end of the 3 years a file is kept. */
const plusThreeYears = (date: string) =>
  `${Number(date.slice(0, 4)) + 3}${date.slice(4)}`

/**
 * Moves a driver between active and inactive, and deletes one added by
 * mistake. Marking them inactive asks whether they left: a driver who left
 * gets a last day, which closes their qualification file; one taking time
 * off keeps it open.
 */
export function DriverStatusMenu({
  organizationId,
  driver,
  listHref,
  today,
}: {
  organizationId: string
  driver: {
    id: string
    full_name: string
    status: DriverStatus
    start_date: string | null
    end_date: string | null
  }
  /** Where to go after deleting: the drivers list. */
  listHref: string
  /** "YYYY-MM-DD" */
  today: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Marking inactive: whether they left, and their last day.
  const [pausing, setPausing] = useState(false)
  const [left, setLeft] = useState(true)
  const [lastDay, setLastDay] = useState(today)

  function change(next: DriverStatus) {
    start(async () => {
      const result = await setDriverStatus(organizationId, driver.id, next)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(
        `${driver.full_name} marked ${DRIVER_STATUS_LABELS[next].toLowerCase()}.`
      )
    })
  }

  /** Inactive: closes their file with a last day if they left. */
  function pause(event: React.FormEvent) {
    event.preventDefault()
    if (!left) {
      setPausing(false)
      change("inactive")
      return
    }
    start(async () => {
      // Saving the last day marks them inactive once it has come.
      const result = await dqFetch<{ closed: number }>(
        `drivers/${driver.id}/end-date`,
        { json: { end_date: lastDay } }
      )
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setPausing(false)
      toast.success(
        lastDay <= today
          ? `${driver.full_name} marked inactive. Their file is kept until ${formatDate(plusThreeYears(lastDay))}.`
          : `${driver.full_name}'s last day is saved. They stay active until then.`
      )
      router.refresh()
    })
  }

  function remove() {
    start(async () => {
      const result = await deleteDriver(organizationId, driver.id)
      if ("error" in result) {
        toast.error(result.error)
        setDeleting(false)
        return
      }
      toast.success(`${driver.full_name} deleted.`)
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
              value={driver.status}
              onValueChange={(value) => {
                // Radio items keep the menu open; close it once one is picked.
                setMenuOpen(false)
                const next = value as DriverStatus
                if (next === "inactive" && driver.status === "active") {
                  // Ask whether they left before marking them inactive.
                  setLeft(true)
                  setLastDay(today)
                  setPausing(true)
                } else if (next !== driver.status) {
                  change(next)
                }
              }}
            >
              {DRIVER_STATUSES.map((status) => (
                <DropdownMenuRadioItem key={status} value={status}>
                  <div className="flex flex-col">
                    <span>{DRIVER_STATUS_LABELS[status]}</span>
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
            Delete driver
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={pausing}
        onOpenChange={(open) => !pending && setPausing(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark {driver.full_name} inactive</DialogTitle>
            <DialogDescription>
              They stay on record but can&apos;t be picked for new loads.
            </DialogDescription>
          </DialogHeader>
          <form
            id="driver-inactive"
            className="flex flex-col gap-4"
            onSubmit={pause}
          >
            <fieldset className="grid gap-2">
              <legend className="sr-only">Why</legend>
              {[
                {
                  value: true,
                  title: "They left",
                  hint: "Closes their qualification file on their last day. It's kept for 3 years.",
                },
                {
                  value: false,
                  title: "Time off",
                  hint: "Leave, a layoff, or a break. Their file stays open for when they're back.",
                },
              ].map((option) => (
                <label
                  key={option.title}
                  className="flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 has-checked:border-brand has-checked:bg-brand/10"
                >
                  <input
                    type="radio"
                    name="why"
                    checked={left === option.value}
                    onChange={() => setLeft(option.value)}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium">{option.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {option.hint}
                  </span>
                </label>
              ))}
            </fieldset>
            {left && (
              <Field>
                <FieldLabel htmlFor="driver-last-day">Last day</FieldLabel>
                <DatePicker
                  id="driver-last-day"
                  required
                  min={driver.start_date ?? undefined}
                  value={lastDay}
                  onChange={setLastDay}
                />
                <FieldDescription>
                  A later date keeps them active until then.
                </FieldDescription>
              </Field>
            )}
          </form>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setPausing(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="driver-inactive"
              disabled={pending || (left && !lastDay)}
            >
              {pending ? "Saving…" : "Mark inactive"}
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
            <DialogTitle>Delete {driver.full_name}?</DialogTitle>
            <DialogDescription>
              For a driver added by mistake. Their documents and pay statements
              are deleted too, and this can&apos;t be undone. A driver who has
              run loads, or whose qualification file has uploads or signatures,
              can&apos;t be deleted; mark them inactive instead.
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
              {pending ? "Deleting…" : "Delete driver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
