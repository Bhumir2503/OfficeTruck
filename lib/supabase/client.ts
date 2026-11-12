import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}

/** URL Supabase sends users back to from emails. */
/** `next` must be allowed by safeNext() in lib/safe-next.ts, or "/" is used. */
export function authRedirectUrl(next = "/") {
  return `${window.location.origin}/auth/confirm?next=${next}`
}
