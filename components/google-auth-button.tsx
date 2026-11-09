"use client"

import { useState } from "react"

import { GoogleIcon } from "@/components/google-icon"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { authRedirectUrl, createClient } from "@/lib/supabase/client"

export function GoogleAuthButton({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function signIn() {
    setError(null)
    setPending(true)
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authRedirectUrl() },
    })
    if (error) {
      setError(error.message)
      setPending(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        type="button"
        disabled={pending}
        onClick={signIn}
      >
        <GoogleIcon />
        {children}
      </Button>
      <FieldError className="text-center">{error}</FieldError>
    </>
  )
}
