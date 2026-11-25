import type { FactoringCompany } from "@/lib/factoring-format"
import { createClient } from "@/lib/supabase/server"

export type { FactoringCompany }

const COLUMNS =
  "name, submission_method, submission_emails, portal_url, phone, remit_line1, remit_line2, remit_city, remit_state, remit_postal_code, notes"

/** The organization's factoring company, or null if it hasn't been set up. */
export async function getFactoringCompany(
  organizationId: string
): Promise<FactoringCompany | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("factoring_companies")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .maybeSingle()
  if (error) {
    throw error
  }
  return data as FactoringCompany | null
}
