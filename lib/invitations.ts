import "server-only"

import type { InviteRole } from "@/lib/schemas/invitation"
import { isInvitationToken } from "@/lib/schemas/invitation"
import { createClient } from "@/lib/supabase/server"

export type PendingInvitation = {
  id: string
  email: string
  role: InviteRole
  createdAt: string
  expiresAt: string
}

/** Unexpired invitations to an organization. Empty for anyone but owners and admins. */
export async function getPendingInvitations(
  organizationId: string
): Promise<PendingInvitation[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("organization_invitations")
    .select("id, email, role, created_at, expires_at")
    .eq("organization_id", organizationId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })

  if (error) {
    throw error
  }
  return data.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role as InviteRole,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }))
}

export type InvitationDetails = {
  organizationName: string
  email: string
  role: InviteRole
  invitedByName: string | null
  expiresAt: string
}

/** What the invitation page shows, or null if the token is unknown or expired. */
export async function getInvitation(
  token: string
): Promise<InvitationDetails | null> {
  if (!isInvitationToken(token)) {
    return null
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc("get_invitation", { invite_token: token })
    .maybeSingle<{
      organization_name: string
      email: string
      role: InviteRole
      invited_by_name: string | null
      expires_at: string
    }>()

  if (error) {
    throw error
  }
  return data
    ? {
        organizationName: data.organization_name,
        email: data.email,
        role: data.role,
        invitedByName: data.invited_by_name,
        expiresAt: data.expires_at,
      }
    : null
}

/** Turns a database error from the invitation functions into a message for people. */
export function invitationErrorMessage(error: {
  hint?: string | null
  message: string
}) {
  switch (error.hint) {
    case "not_allowed":
      return "Only owners and admins can invite people."
    case "already_member":
      return "That person is already a member of this organization."
    case "invitation_invalid":
      return "This invitation is invalid or has expired. Ask for a new one."
    case "email_mismatch":
      return "This invitation was sent to a different email address."
    case "email_unconfirmed":
      return "Confirm your email address before accepting."
    case "not_signed_in":
      return "Sign in to accept this invitation."
    default:
      return error.message
  }
}
