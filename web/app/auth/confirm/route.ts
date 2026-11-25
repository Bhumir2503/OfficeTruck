import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

import { safeNext } from "@/lib/safe-next"
import { createClient } from "@/lib/supabase/server"

/**
 * Landing point for email links. Handles both link styles Supabase can send:
 * `code` (default email templates) and `token_hash` (customised templates).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  // An allowlist rather than a raw redirect, so links can't send users off-site.
  const next = safeNext(searchParams.get("next")) ?? "/"
  const isEmailChange = type === "email_change" || next === "/account"

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
  } else if (searchParams.get("message") && !searchParams.get("error")) {
    // With secure email change, Supabase's own link for the first of the two
    // addresses comes back with only a "now confirm the other one" message.
    verified = true
  }

  // Email changes go back to the profile page, which explains what happened.
  // (Someone changing their email is usually signed in, so /login would just
  // bounce them away and hide the error.)
  if (isEmailChange) {
    return NextResponse.redirect(
      new URL(
        `/account?email_link=${verified ? "confirmed" : "invalid"}`,
        request.url
      )
    )
  }

  return NextResponse.redirect(
    new URL(verified ? next : "/login?error=link_invalid", request.url)
  )
}
