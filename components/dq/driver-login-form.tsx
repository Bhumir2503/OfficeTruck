"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { toE164 } from "@/lib/schemas/dq"
import { createClient } from "@/lib/supabase/client"

/**
 * Sign-in by text message: the driver's number, then the 6-digit code.
 * Once in, their login is linked to the driver their carrier set up with
 * that number.
 */
export function DriverLoginForm() {
  const router = useRouter()
  const [phone, setPhone] = useState("")
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function sendCode(event: React.FormEvent) {
    event.preventDefault()
    const number = toE164(phone)
    if (!number) {
      setError("Enter your 10-digit phone number.")
      return
    }
    setPending(true)
    setError(null)
    const { error: sendError } = await createClient().auth.signInWithOtp({
      phone: number,
      options: { shouldCreateUser: true },
    })
    setPending(false)
    if (sendError) {
      setError("We couldn't text that number. Check it and try again.")
      return
    }
    setSentTo(number)
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault()
    if (!sentTo) return
    setPending(true)
    setError(null)
    const { error: verifyError } = await createClient().auth.verifyOtp({
      phone: sentTo,
      token: code.trim(),
      type: "sms",
    })
    if (verifyError) {
      setPending(false)
      setError("That code didn't work. Check it, or send a new one.")
      return
    }
    // Links this login to the driver the carrier set up with this number.
    await fetch("/api/dq/me")
    router.replace("/driver")
    router.refresh()
  }

  if (!sentTo) {
    return (
      <form onSubmit={sendCode} className="flex flex-col gap-4">
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="driver-phone">Phone number</FieldLabel>
          <Input
            id="driver-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(555) 123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            className="h-11 text-base"
          />
          {error && (
            <FieldDescription className="text-destructive">
              {error}
            </FieldDescription>
          )}
        </Field>
        <Button type="submit" size="lg" className="h-11" disabled={pending}>
          {pending ? "Sending…" : "Text me a code"}
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="driver-code">Code we texted you</FieldLabel>
        <Input
          id="driver-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          required
          className="h-11 text-center text-lg tracking-[0.4em]"
        />
        {error && (
          <FieldDescription className="text-destructive">
            {error}
          </FieldDescription>
        )}
      </Field>
      <Button
        type="submit"
        size="lg"
        className="h-11"
        disabled={pending || code.length !== 6}
      >
        {pending ? "Checking…" : "Sign in"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setSentTo(null)
          setCode("")
        }}
      >
        Use a different number
      </Button>
    </form>
  )
}
