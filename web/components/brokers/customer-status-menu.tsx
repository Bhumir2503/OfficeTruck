"use client"

import { ChevronDownIcon, RefreshCw } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { runFmcsaCheck, setDoNotUse } from "@/app/org/[slug]/customers/actions"
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
import { Textarea } from "@/components/ui/textarea"
import type { Broker } from "@/lib/brokers"

type Status = "ok" | "do_not_use"

const STATUSES: { value: Status; label: string; hint: string }[] = [
  {
    value: "ok",
    label: "Okay to book",
    hint: "New loads go through as usual.",
  },
  {
    value: "do_not_use",
    label: "Do not use",
    hint: "New loads with them show a warning. History stays.",
  },
]

/**
 * The customer page's status menu, like the truck and driver pages': okay to
 * book or do not use (asking why), and checking a broker with FMCSA again.
 */
export function CustomerStatusMenu({
  organizationId,
  broker,
}: {
  organizationId: string
  broker: Pick<
    Broker,
    | "id"
    | "kind"
    | "legal_name"
    | "mc_number"
    | "do_not_use"
    | "do_not_use_reason"
  >
}) {
  const [pending, start] = useTransition()
  const [menuOpen, setMenuOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState(broker.do_not_use_reason ?? "")

  function save(doNotUse: boolean) {
    start(async () => {
      const result = await setDoNotUse(organizationId, broker.id, {
        do_not_use: doNotUse,
        do_not_use_reason: doNotUse ? reason : null,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      setAsking(false)
      toast.success(
        doNotUse
          ? `${broker.legal_name} marked do not use.`
          : `${broker.legal_name} is okay to book again.`
      )
    })
  }

  function recheck() {
    start(async () => {
      const result = await runFmcsaCheck(organizationId, broker.id)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Checked with FMCSA.")
    })
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          disabled={pending}
          render={<Button variant="outline" size="sm" className="w-fit" />}
        >
          {pending ? "Saving…" : "Change status"}
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={broker.do_not_use ? "do_not_use" : "ok"}
              onValueChange={(value) => {
                // Radio items keep the menu open; close it once one is picked.
                setMenuOpen(false)
                if (value === "do_not_use") {
                  // Ask why, even when already marked, so the reason can change.
                  setAsking(true)
                } else if (broker.do_not_use) {
                  save(false)
                }
              }}
            >
              {STATUSES.map((status) => (
                <DropdownMenuRadioItem key={status.value} value={status.value}>
                  <div className="flex flex-col">
                    <span>{status.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {status.hint}
                    </span>
                  </div>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          {broker.kind === "broker" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!broker.mc_number} onClick={recheck}>
                <RefreshCw />
                {broker.mc_number
                  ? "Check with FMCSA again"
                  : "Add the MC number to check FMCSA"}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={asking}
        onOpenChange={(open) => !pending && setAsking(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Do not use</DialogTitle>
            <DialogDescription>
              New loads with {broker.legal_name} show this warning. Their loads,
              invoices and payments stay as they are.
            </DialogDescription>
          </DialogHeader>
          <form
            id="customer-do-not-use"
            onSubmit={(event) => {
              event.preventDefault()
              save(true)
            }}
          >
            <Field>
              <FieldLabel htmlFor="customer-do-not-use-reason">Why</FieldLabel>
              <Textarea
                id="customer-do-not-use-reason"
                rows={3}
                maxLength={500}
                autoFocus
                placeholder="e.g. paid 90 days late twice"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </form>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setAsking(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="customer-do-not-use"
              variant="destructive"
              disabled={pending}
            >
              {pending ? "Saving…" : "Mark do not use"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
