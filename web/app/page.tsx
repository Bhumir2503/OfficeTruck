import { redirect } from "next/navigation"

import { getMyOrganizations, getUser } from "@/lib/organizations"

// Where everyone lands after signing in: straight into their organization when
// they have exactly one, otherwise the picker at /org.
export default async function Page() {
  if (!(await getUser())) {
    redirect("/login")
  }

  const organizations = await getMyOrganizations()
  redirect(
    organizations.length === 1 ? `/org/${organizations[0].slug}` : "/org"
  )
}
