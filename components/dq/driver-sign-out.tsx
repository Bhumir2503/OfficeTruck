"use client"

import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

export function DriverSignOut() {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, setPending] = useState(false)
  if (pathname === "/driver/login") return null
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        await createClient().auth.signOut()
        router.replace("/driver/login")
        router.refresh()
      }}
    >
      Sign out
    </Button>
  )
}
