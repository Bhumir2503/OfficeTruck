import { redirect } from "next/navigation"

import { getMyOrganizations, getUser } from "@/lib/organizations"

/**
 * A link to "your profile" that doesn't need to know an organization, for
 * emails. The profile is the same in every organization, so this opens it in
 * the user's first one, keeping any query string (e.g. `?email_link=`).
 */
export default async function AccountRedirect({
  searchParams,
}: PageProps<"/account">) {
  if (!(await getUser())) {
    redirect("/login")
  }

  const [organization] = await getMyOrganizations()
  if (!organization) {
    redirect("/org")
  }

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") {
      query.set(key, value)
    }
  }
  const search = query.size ? `?${query}` : ""
  redirect(`/org/${organization.slug}/account${search}`)
}
