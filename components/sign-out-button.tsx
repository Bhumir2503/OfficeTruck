"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

export function SignOutButton({
  ...props
}: React.ComponentProps<typeof Button>) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function signOut() {
    setPending(true)
    await createClient().auth.signOut()
    router.replace("/login")
    router.refresh()
  }

  return (
    <Button variant="ghost" disabled={pending} onClick={signOut} {...props}>
      Sign out
    </Button>
  )
}
