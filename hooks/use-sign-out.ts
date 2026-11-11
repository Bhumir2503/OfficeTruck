"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { createClient } from "@/lib/supabase/client"

export function useSignOut() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function signOut() {
    setPending(true)
    await createClient().auth.signOut()
    router.replace("/login")
    router.refresh()
  }

  return { signOut, pending }
}
