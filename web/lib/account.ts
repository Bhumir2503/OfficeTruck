import { cache } from "react"

import { createClient } from "@/lib/supabase/server"

export type Account = {
  id: string
  email: string
  /** An email change waiting for the user to confirm it, if any. */
  newEmail: string | null
  fullName: string
  avatarUrl: string | null
  createdAt: string
}

/** The signed-in user's account details for the profile page, or null when signed out. */
export const getAccount = cache(async (): Promise<Account | null> => {
  const supabase = await createClient()
  // getUser (not getClaims) so a pending email change is included.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle()
  if (error) {
    throw error
  }

  return {
    id: user.id,
    email: user.email ?? "",
    newEmail: user.new_email ?? null,
    fullName: String(profile?.full_name || user.user_metadata?.full_name || ""),
    avatarUrl: profile?.avatar_url ?? null,
    createdAt: user.created_at,
  }
})
