import { z } from "zod"

export const INVITE_ROLES = ["admin", "member"] as const
export type InviteRole = (typeof INVITE_ROLES)[number]

export const inviteSchema = z.object({
  email: z
    .email("Enter a valid email address.")
    .max(320, "That email address is too long.")
    .transform((email) => email.trim().toLowerCase()),
  role: z.enum(INVITE_ROLES, "Choose a role."),
})

/** Invitation tokens are 64 hex characters (see invite_to_organization). */
export function isInvitationToken(value: string) {
  return /^[0-9a-f]{64}$/.test(value)
}
