import { createClient } from "@supabase/supabase-js"

/**
 * A Supabase client with the project's secret key, which bypasses row-level
 * security. Only for writes no user may make directly, like the shared FMCSA
 * table. Only import this from server code (server actions and pages):
 * the key must never reach the browser. Returns null when the key isn't
 * configured, so callers can say what's missing.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) {
    return null
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
