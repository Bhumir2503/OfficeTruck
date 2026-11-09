import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}

/** URL Supabase sends users back to from emails and OAuth. */
export function authRedirectUrl(next: "/" | "/reset-password" = "/") {
  return `${window.location.origin}/auth/confirm?next=${next}`
}
