"use server"

import { createClient } from "@/lib/supabase/server"

export type AcceptResult = { error: string } | { ok: true; acceptedAt: string }

/** The driver accepting a load from their private link. No sign-in needed. */
export async function acceptDispatch(token: string): Promise<AcceptResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("accept_dispatch", {
    link_token: token,
  })
  if (error) {
    return { error: error.hint ? error.message : "Couldn't accept the load." }
  }
  return { ok: true, acceptedAt: data as string }
}
