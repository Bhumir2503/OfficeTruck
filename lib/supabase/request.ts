import "server-only"

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js"

import { createClient as createCookieClient } from "@/lib/supabase/server"

/**
 * A Supabase client acting as whoever made the request: the phone app sends
 * its session as "Authorization: Bearer <access token>", the web app uses
 * its cookies. Either way row-level security applies as that user.
 * `signedIn` is false when there's no valid session.
 */
export async function createRequestClient(
  request: Request
): Promise<{ supabase: SupabaseClient; signedIn: boolean }> {
  const header = request.headers.get("authorization")
  const token = header?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) {
    const supabase = await createCookieClient()
    const { data } = await supabase.auth.getClaims()
    return { supabase, signedIn: !!data?.claims }
  }
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
  const { data } = await supabase.auth.getClaims(token)
  return { supabase, signedIn: !!data?.claims }
}
