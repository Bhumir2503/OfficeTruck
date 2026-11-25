import { redirect } from "next/navigation"

import { Logo } from "@/components/logo"
import { ResetPasswordForm } from "@/components/reset-password-form"
import { createClient } from "@/lib/supabase/server"

export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  // The emailed link signs the user in via /auth/confirm before landing here.
  if (!data?.claims) {
    redirect("/login?error=link_invalid")
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Logo className="self-center" />
        <ResetPasswordForm />
      </div>
    </div>
  )
}
