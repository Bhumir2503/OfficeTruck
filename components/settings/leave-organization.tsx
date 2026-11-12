"use client"

import { LogOutIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { leaveOrganization } from "@/app/org/[slug]/settings/actions"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function LeaveOrganization({
  organizationId,
  name,
  isOwner,
}: {
  organizationId: string
  name: string
  isOwner: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function leave() {
    setPending(true)
    setError(null)
    const result = await leaveOrganization(organizationId)
    if ("error" in result) {
      setPending(false)
      setError(result.error)
      return
    }
    // "/" sends the user to another organization, or the picker if none are left.
    router.replace("/")
    router.refresh()
  }

  return (
    <SettingsCard
      title="Leave this organization"
      description={`Remove yourself from ${name}. You'll lose access to it right away.`}
      footer={
        <SettingsCardFooter
          hint={
            isOwner
              ? "The owner can't leave. Transfer ownership on the Members page first."
              : "To come back, someone will need to invite you again."
          }
        >
          <Dialog
            open={open}
            onOpenChange={(next) => {
              if (!pending) {
                setOpen(next)
                setError(null)
              }
            }}
          >
            <DialogTrigger
              render={
                <Button variant="destructive" size="sm" disabled={isOwner} />
              }
            >
              Leave organization
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10">
                  <LogOutIcon className="size-5 text-destructive" />
                </div>
                <DialogTitle>Leave {name}?</DialogTitle>
                <DialogDescription>
                  You&apos;ll lose access to {name} right away. To come back,
                  an owner or admin will need to invite you again.
                </DialogDescription>
              </DialogHeader>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-destructive text-white hover:bg-destructive/90"
                  disabled={pending}
                  onClick={leave}
                >
                  {pending ? "Leaving…" : "Leave organization"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </SettingsCardFooter>
      }
    />
  )
}
