"use server"

import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { ok: true }

/** Removes the signed-in user from the organization. Not for the owner. */
export async function leaveOrganization(
  organizationId: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc("leave_organization", {
    org_id: organizationId,
  })
  if (error) {
    switch (error.hint) {
      case "owner_cannot_leave":
        return {
          error:
            "The owner can't leave. Transfer ownership first, or delete the organization.",
        }
      case "not_a_member":
        return { error: "You aren't a member of this organization anymore." }
      default:
        return { error: error.message }
    }
  }
  return { ok: true }
}
