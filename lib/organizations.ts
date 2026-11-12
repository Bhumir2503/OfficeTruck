import { cache } from "react"

import { createClient } from "@/lib/supabase/server"

export type OrganizationRole = "owner" | "admin" | "member"

export type Organization = {
  id: string
  name: string
  slug: string
  /** The signed-in user's role in this organization. */
  role: OrganizationRole
}

export type OrganizationProfile = {
  name: string
  legal_name: string | null
  dot_number: string | null
  mc_number: string | null
  phone: string | null
  email: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
}

export type OrganizationMember = {
  userId: string
  name: string | null
  avatarUrl: string | null
  role: OrganizationRole
  joinedAt: string
}

/** The signed-in user's claims, or null when signed out. */
export const getUser = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return data?.claims ?? null
})

/** Organizations the signed-in user belongs to, oldest membership first. */
export const getMyOrganizations = cache(async (): Promise<Organization[]> => {
  const user = await getUser()
  if (!user) {
    return []
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("organization_users")
    .select("role, created_at, organizations (id, name, slug)")
    .eq("user_id", user.sub)
    .order("created_at")

  if (error) {
    throw error
  }

  return data.flatMap(({ role, organizations }) =>
    organizations
      ? [
          {
            ...(organizations as unknown as Omit<Organization, "role">),
            role: role as OrganizationRole,
          },
        ]
      : []
  )
})

/** One of the user's organizations by slug, or null if it doesn't exist or they aren't a member. */
export const getOrganization = cache(async (slug: string) => {
  const organizations = await getMyOrganizations()
  return organizations.find((org) => org.slug === slug) ?? null
})

export function canManage(organization: Organization) {
  return organization.role === "owner" || organization.role === "admin"
}

/** The company profile shown on the settings page. */
export async function getOrganizationProfile(
  organizationId: string
): Promise<OrganizationProfile> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("organizations")
    .select(
      "name, legal_name, dot_number, mc_number, phone, email, address_line1, address_line2, city, state, postal_code"
    )
    .eq("id", organizationId)
    .single()

  if (error) {
    throw error
  }
  return data
}

/** Everyone in the organization, owners first, then by join date. */
export async function getOrganizationMembers(
  organizationId: string
): Promise<OrganizationMember[]> {
  const supabase = await createClient()
  const { data: members, error } = await supabase
    .from("organization_users")
    .select("user_id, role, created_at")
    .eq("organization_id", organizationId)
    .order("created_at")

  if (error) {
    throw error
  }

  // There's no foreign key from organization_users to profiles, so join here.
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in(
      "id",
      members.map((member) => member.user_id)
    )

  if (profilesError) {
    throw profilesError
  }

  const byId = new Map(profiles.map((p) => [p.id, p]))
  const rank = { owner: 0, admin: 1, member: 2 }

  return members
    .map((member) => ({
      userId: member.user_id,
      name: byId.get(member.user_id)?.full_name ?? null,
      avatarUrl: byId.get(member.user_id)?.avatar_url ?? null,
      role: member.role as OrganizationRole,
      joinedAt: member.created_at,
    }))
    .sort((a, b) => rank[a.role] - rank[b.role])
}
