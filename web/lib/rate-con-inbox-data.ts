import type { RateConExtraction } from "@/lib/rate-con-format"
import { createClient } from "@/lib/supabase/server"

export type InboxStatus = "reading" | "ready" | "failed" | "used" | "dismissed"

/** A rate con that came in by email, as the inbox lists it. */
export type InboxItem = {
  id: string
  from_email: string
  sender_email: string | null
  subject: string | null
  received_at: string
  path: string
  file_name: string
  content_type: string
  status: InboxStatus
  extraction: RateConExtraction | null
  error: string | null
  load_id: string | null
}

const COLUMNS =
  "id, from_email, sender_email, subject, received_at, path, file_name, content_type, status, extraction, error, load_id"

/** The last 30 days of rate cons that came in by email, newest first. */
export async function getInboxItems(
  organizationId: string
): Promise<InboxItem[]> {
  const supabase = await createClient()
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from("rate_con_inbox")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .gt("received_at", since)
    .order("received_at", { ascending: false })
  if (error) throw error
  return data as InboxItem[]
}

/** One inbox item, for New Load, with a short-lived link to its file. */
export async function getInboxItem(organizationId: string, id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("rate_con_inbox")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle()
  if (error && error.code !== "22P02") throw error
  if (!data) return null
  const item = data as InboxItem
  const { data: signed } = await supabase.storage
    .from("load-documents")
    .createSignedUrl(item.path, 60 * 10)
  return { ...item, url: signed?.signedUrl ?? null }
}

/** Rate cons waiting to become loads: read, or still being read. */
export async function getInboxWaiting(organizationId: string) {
  const supabase = await createClient()
  const { count } = await supabase
    .from("rate_con_inbox")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("status", ["reading", "ready", "failed"])
  return count ?? 0
}

/** The company's forwarding address, or null until the inbox domain is set. */
export async function getInboxAddress(organizationId: string) {
  const domain = process.env.RATE_CON_INBOX_DOMAIN
  const supabase = await createClient()
  const { data } = await supabase
    .from("organizations")
    .select("rate_con_inbox_token")
    .eq("id", organizationId)
    .maybeSingle()
  if (!data?.rate_con_inbox_token) return { address: null, domainSet: !!domain }
  return {
    address: domain ? `rc-${data.rate_con_inbox_token}@${domain}` : null,
    domainSet: !!domain,
  }
}
