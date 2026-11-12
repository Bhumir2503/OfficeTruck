import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { SettingsMembers1, type Member } from "@/components/settings-members1"
import { getPendingInvitations } from "@/lib/invitations"
import {
  canManage,
  getOrganization,
  getOrganizationMembers,
  getUser,
} from "@/lib/organizations"

export const metadata: Metadata = { title: "Members" }

export default async function MembersSettingsPage({
  params,
}: PageProps<"/org/[slug]/settings/members">) {
  const organization = await getOrganization((await params).slug)
  const user = await getUser()
  if (!organization || !user) {
    notFound()
  }

  const members: Member[] = (await getOrganizationMembers(organization.id)).map(
    (member) => {
      const isYou = member.userId === user.sub
      return {
        id: member.userId,
        name: member.name || (isYou ? String(user.email) : "Unnamed member"),
        email: isYou ? user.email : undefined,
        avatarUrl: member.avatarUrl,
        role: member.role,
        joinedAt: member.joinedAt,
        isYou,
      }
    }
  )

  const manager = canManage(organization)
  const invitations = manager
    ? await getPendingInvitations(organization.id)
    : []

  return (
    <SettingsMembers1
      subHeading={`Everyone with access to ${organization.name}, and the role each person has.`}
      users={members}
      organizationId={organization.id}
      organizationName={organization.name}
      viewerRole={organization.role}
      invitations={invitations}
    />
  )
}
