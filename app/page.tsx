import { redirect } from "next/navigation"

import { getMyOrganizations, getUser } from "@/lib/organizations"
import { createClient } from "@/lib/supabase/server"

// Where everyone lands after signing in: straight into their organization when
// they have exactly one, otherwise the picker at /org.
export default async function Page() {
  if (!(await getUser())) {
    redirect("/login")
  }

  const organizations = await getMyOrganizations()
  // Drivers who sign in by text aren't in any organization: their files
  // are at /driver.
  if (organizations.length === 0) {
    const supabase = await createClient()
    await supabase.rpc("claim_driver_logins")
    const { data } = await supabase.rpc("my_dq_drivers")
    if (Array.isArray(data) && data.length > 0) {
      redirect("/driver")
    }
  }
  redirect(
    organizations.length === 1 ? `/org/${organizations[0].slug}/loads` : "/org"
  )
}
