"use server"

import { refresh } from "next/cache"

import { appUrl } from "@/lib/app-url"
import { sendInvitationEmail } from "@/lib/email/invitation-email"
import { invitationErrorMessage } from "@/lib/invitations"
import { getMyOrganizations, getUser } from "@/lib/organizations"
import { inviteSchema, type InviteRole } from "@/lib/schemas/invitation"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { ok: true }

/**
 * Creates (or renews) an invitation and emails the link. If the email can't
 * be sent, the invitation is removed again so nothing is left pending that
 * the person never heard about.
 */
async function invite(
  organizationId: string,
  email: string,
  role: InviteRole
): Promise<ActionResult> {
  const user = await getUser()
  const organization = (await getMyOrganizations()).find(
    (org) => org.id === organizationId
  )
  if (!user || !organization) {
    return { error: "Only owners and admins can invite people." }
  }

  const supabase = await createClient()
  const { data: token, error } = await supabase.rpc("invite_to_organization", {
    org_id: organizationId,
    invite_email: email,
    invite_role: role,
  })
  if (error) {
    return { error: invitationErrorMessage(error) }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.sub)
    .maybeSingle()

  const emailError = await sendInvitationEmail({
    to: email,
    organizationName: organization.name,
    inviterName: profile?.full_name || String(user.email ?? "A teammate"),
    role,
    link: `${await appUrl()}/invite/${token as string}`,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  })
  if (emailError) {
    await supabase
      .from("organization_invitations")
      .delete()
      .eq("organization_id", organizationId)
      .eq("email", email)
    return { error: emailError }
  }

  refresh()
  return { ok: true }
}

export async function inviteMember(
  organizationId: string,
  input: { email: string; role: string }
): Promise<ActionResult> {
  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }
  return invite(organizationId, parsed.data.email, parsed.data.role)
}

/** Sends a pending invitation again with a fresh link and a new 7 days. */
export async function resendInvitation(
  invitationId: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("organization_invitations")
    .select("organization_id, email, role")
    .eq("id", invitationId)
    .maybeSingle()
  if (!data) {
    return { error: "That invitation no longer exists." }
  }
  return invite(data.organization_id, data.email, data.role as InviteRole)
}

export async function revokeInvitation(
  invitationId: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("organization_invitations")
    .delete()
    .eq("id", invitationId)
    .select("id")
  if (error) {
    return { error: error.message }
  }
  // Row-level security skips the delete, rather than failing, for non-admins.
  if (!data.length) {
    return { error: "That invitation no longer exists." }
  }
  refresh()
  return { ok: true }
}

function roleErrorMessage(error: { hint?: string | null; message: string }) {
  switch (error.hint) {
    case "not_owner":
      return "Only the owner can change roles."
    case "cannot_change_self":
      return "You can't change your own role."
    case "not_a_member":
      return "That person isn't a member of this organization anymore."
    case "invalid_role":
      return "Choose admin or member."
    default:
      return error.message
  }
}

/** Moves a member between admin and member. Owner only. */
export async function changeMemberRole(
  organizationId: string,
  userId: string,
  role: string
): Promise<ActionResult> {
  if (role !== "admin" && role !== "member") {
    return { error: "Choose admin or member." }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("set_member_role", {
    org_id: organizationId,
    member_id: userId,
    new_role: role,
  })
  if (error) {
    return { error: roleErrorMessage(error) }
  }
  refresh()
  return { ok: true }
}

function removeErrorMessage(error: { hint?: string | null; message: string }) {
  switch (error.hint) {
    case "not_allowed":
      return "You don't have permission to remove this person."
    case "cannot_remove_self":
      return "You can't remove yourself."
    case "cannot_remove_owner":
      return "The owner can't be removed."
    case "not_a_member":
      return "That person isn't a member of this organization anymore."
    default:
      return error.message
  }
}

/**
 * Removes someone from the organization. The owner can remove admins and
 * members; admins can remove members.
 */
export async function removeMember(
  organizationId: string,
  userId: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc("remove_member", {
    org_id: organizationId,
    member_id: userId,
  })
  if (error) {
    return { error: removeErrorMessage(error) }
  }
  refresh()
  return { ok: true }
}

/** Makes someone else the owner. The current owner becomes an admin. */
export async function transferOwnership(
  organizationId: string,
  userId: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc("transfer_ownership", {
    org_id: organizationId,
    new_owner_id: userId,
  })
  if (error) {
    return { error: roleErrorMessage(error) }
  }
  refresh()
  return { ok: true }
}
