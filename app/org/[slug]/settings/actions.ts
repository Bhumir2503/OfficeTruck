"use server"

import { refresh } from "next/cache"

import { canManage, getMyOrganizations } from "@/lib/organizations"
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

/** Whether drivers see the rate and charges on loads they're sent. */
export async function setShareRateWithDrivers(
  organizationId: string,
  share: boolean
): Promise<{ error: string } | { ok: true }> {
  const organization = (await getMyOrganizations()).find(
    (org) => org.id === organizationId
  )
  if (!organization || !canManage(organization)) {
    return { error: "Only owners and admins can change this." }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("organizations")
    .update({ share_rate_with_drivers: share === true })
    .eq("id", organizationId)
    .select("id")
  if (error) {
    return { error: error.message }
  }
  if (!data.length) {
    return { error: "Only owners and admins can change this." }
  }
  refresh()
  return { ok: true }
}
