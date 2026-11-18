"use client"

import { DoorOpen } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

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
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { LICENSE_CLASSES } from "@/lib/schemas/dq"

export type DriverFacts = {
  id: string
  full_name: string
  license_class: (typeof LICENSE_CLASSES)[number] | null
  cdl_state: string | null
  prior_license_states: string[]
  start_date: string | null
  end_date: string | null
  holds_medical_variance: boolean
  login_phone: string | null
  linked: boolean
}

/** Sets the day the driver left: recurring work stops and the file freezes. */
export function EndDateButton({ driver }: { driver: DriverFacts }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [date, setDate] = useState("")

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    const result = await dqFetch<{ closed: number }>(
      `drivers/${driver.id}/end-date`,
      {
        json: { end_date: date },
      }
    )
    setPending(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(
      `End date saved. The file is kept until ${Number(date.slice(0, 4)) + 3}${date.slice(4)}.`
    )
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <DoorOpen /> Driver left
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{driver.full_name} left</DialogTitle>
            <DialogDescription>
              Recurring work stops, items due later are closed, and the file
              becomes read-only after this date. It&apos;s kept for 3 years.
            </DialogDescription>
          </DialogHeader>
          <form id="dq-end-date" onSubmit={save}>
            <Field>
              <FieldLabel htmlFor="dq-end">Last day</FieldLabel>
              <Input
                id="dq-end"
                type="date"
                required
                min={driver.start_date ?? undefined}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </form>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="dq-end-date"
              disabled={pending || !date}
            >
              Save end date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
