import type { Metadata } from "next"

import { DriverLoginForm } from "@/components/dq/driver-login-form"

export const metadata: Metadata = { title: "Driver sign in" }

export default function DriverLoginPage() {
  return (
    <div className="flex flex-col gap-6 pt-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-brand-ink">
          Your driver file
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in with the phone number your carrier has for you. We&apos;ll
          text you a code.
        </p>
      </div>
      <DriverLoginForm />
    </div>
  )
}
