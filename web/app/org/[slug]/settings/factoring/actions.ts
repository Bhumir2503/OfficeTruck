"use server"

import { refresh } from "next/cache"

import { canManage, getMyOrganizations } from "@/lib/organizations"
import {
  factoringCompanySchema,
  type FactoringCompanyValues,
} from "@/lib/schemas/broker"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { ok: true }

/** Sets up the factoring company, or saves changes to it. */
export async function saveFactoringCompany(
  organizationId: string,
  input: FactoringCompanyValues
): Promise<ActionResult> {
  const organization = (await getMyOrganizations()).find(
    (org) => org.id === organizationId
  )
  if (!organization || !canManage(organization)) {
    return { error: "Only owners and admins can change the factoring company." }
  }

  const parsed = factoringCompanySchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("factoring_companies")
    .upsert(
      { ...parsed.data, organization_id: organizationId },
      { onConflict: "organization_id" }
    )

  if (error) {
    return { error: error.message }
  }
  refresh()
  return { ok: true }
}
