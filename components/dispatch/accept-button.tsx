"use client"

import { CheckCheck } from "lucide-react"
import { useState } from "react"

import { acceptDispatch } from "@/app/dispatch/[token]/actions"
import { LocalTime } from "@/components/loads/local-time"
import { Button } from "@/components/ui/button"

/** The driver's Accept button, which lets dispatch know they've got it. */
export function AcceptButton({
  token,
  acceptedAt,
}: {
  token: string
  acceptedAt: string | null
}) {
  const [accepted, setAccepted] = useState(acceptedAt)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (accepted) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
        <CheckCheck className="size-5" />
        Accepted <LocalTime value={accepted} />
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={async () => {
          setPending(true)
          const result = await acceptDispatch(token)
          setPending(false)
          if ("error" in result) {
            setError(result.error)
          } else {
            setAccepted(result.acceptedAt)
          }
        }}
      >
        <CheckCheck />
        {pending ? "Accepting…" : "Accept load"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
