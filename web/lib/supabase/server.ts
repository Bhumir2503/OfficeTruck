import { AsyncLocalStorage } from "node:async_hooks"

import { createServerClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

// Scheduled jobs (like automatic invoicing) have no signed-in user. While
// one runs inside runAsSystem(), createClient() returns the job's
// secret-key client instead, so the same data code serves both.
const system = new AsyncLocalStorage<SupabaseClient>()

/**
 * Runs `work` with createClient() returning `client`: the secret-key client
 * from createAdminClient(). Only for cron routes that have checked their
 * secret; it bypasses row-level security.
 */
export function runAsSystem<T>(client: SupabaseClient, work: () => Promise<T>) {
  return system.run(client, work)
}

/** The signed-in user's client, from the request's cookies. */
function userClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Components can't set cookies. proxy.ts refreshes the
            // session before they render, so this is safe to ignore.
          }
        },
      },
    }
  )
}

export async function createClient(): Promise<ReturnType<typeof userClient>> {
  const asSystem = system.getStore()
  if (asSystem) {
    return asSystem as unknown as ReturnType<typeof userClient>
  }
  return userClient(await cookies())
}
