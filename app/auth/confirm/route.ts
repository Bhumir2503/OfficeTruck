import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

import { createClient } from "@/lib/supabase/server"

/**
 * Landing point for email links and OAuth. Handles both link styles Supabase
 * can send: `code` (default email templates and OAuth) and `token_hash`
 * (customised email templates).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  // An allowlist rather than a raw redirect, so links can't send users off-site.
  const next =
    searchParams.get("next") === "/reset-password" ? "/reset-password" : "/"

  const supabase = await createClient()
  let verified = false

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    verified = !error
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    })
    verified = !error
  }

  return NextResponse.redirect(
    new URL(verified ? next : "/login?error=link_invalid", request.url)
  )
}
