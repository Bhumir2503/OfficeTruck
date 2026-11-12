import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}

/** URL Supabase sends users back to from emails. */
export function authRedirectUrl(
  next: "/" | "/reset-password" | "/account" = "/"
) {
  return `${window.location.origin}/auth/confirm?next=${next}`
}
