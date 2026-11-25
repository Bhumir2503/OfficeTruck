"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import {
  acceptInvitation,
  declineInvitation,
} from "@/app/invite/[token]/actions"
import { Button, buttonVariants } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

/** Accept and decline, for the signed-in person the invitation was sent to. */
export function InvitationResponse({ token }: { token: string }) {
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [declined, setDeclined] = useState(false)

  if (declined) {
    return (
      <div className="flex flex-col gap-3 text-center">
        <p className="text-sm text-muted-foreground">
          You declined the invitation.
        </p>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Go to OfficeTruck
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        disabled={pending}
        onClick={() => {
          setBusy("accept")
          setError(null)
          startTransition(async () => {
            const result = await acceptInvitation(token)
            // Only returns on failure; success redirects to the organization.
            if (result?.error) {
              setError(result.error)
            }
            setBusy(null)
          })
        }}
      >
        {busy === "accept" ? "Joining…" : "Accept invitation"}
      </Button>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() => {
          setBusy("decline")
          setError(null)
          startTransition(async () => {
            await declineInvitation(token)
            // No refresh: the invitation is gone now, so a re-render would
            // replace this confirmation with "This invitation isn't valid".
            setDeclined(true)
            setBusy(null)
          })
        }}
      >
        {busy === "decline" ? "Declining…" : "Decline"}
      </Button>
      {error && (
        <p role="alert" className="text-center text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/** For someone signed in with a different address: sign out, then sign in as the invitee. */
export function SwitchAccount({
  next,
  email,
}: {
  next: string
  email: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  return (
    <Button
      disabled={pending}
      onClick={async () => {
        setPending(true)
        await createClient().auth.signOut()
        router.replace(
          `/login?${new URLSearchParams({ next, email }).toString()}`
        )
        router.refresh()
      }}
    >
      {pending ? "Signing out…" : `Sign in as ${email}`}
    </Button>
  )
}
