"use server"

import { redirect } from "next/navigation"

import { invitationErrorMessage } from "@/lib/invitations"
import { isInvitationToken } from "@/lib/schemas/invitation"
import { createClient } from "@/lib/supabase/server"

/** Joins the organization and opens it. Returns an error message on failure. */
export async function acceptInvitation(token: string) {
  if (!isInvitationToken(token)) {
    return {
      error: invitationErrorMessage({
        hint: "invitation_invalid",
        message: "",
      }),
    }
  }
  const supabase = await createClient()
  const { data: slug, error } = await supabase.rpc("accept_invitation", {
    invite_token: token,
  })
  if (error) {
    return { error: invitationErrorMessage(error) }
  }
  redirect(`/org/${slug as string}`)
}

export async function declineInvitation(token: string) {
  if (isInvitationToken(token)) {
    const supabase = await createClient()
    await supabase.rpc("decline_invitation", { invite_token: token })
  }
  return { ok: true }
}
