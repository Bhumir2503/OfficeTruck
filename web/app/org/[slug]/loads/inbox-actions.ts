"use server"

import { refresh } from "next/cache"

import { getMyOrganizations, getUser } from "@/lib/organizations"
import { readInboxItem } from "@/lib/rate-con-inbox"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

type ActionResult = { error: string } | { ok: true }

async function isMember(organizationId: string) {
  const user = await getUser()
  return (
    !!user &&
    (await getMyOrganizations()).some((org) => org.id === organizationId)
  )
}

async function setStatus(
  organizationId: string,
  id: string,
  values: { status: "used" | "dismissed" | "ready"; load_id?: string | null }
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("rate_con_inbox")
    .update(values)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .select("id")
  if (error) return { error: error.message }
  if (!data.length)
    return { error: "That rate con isn't in the inbox anymore." }
  refresh()
  return { ok: true }
}

/** Takes a rate con out of the inbox without making a load. */
export async function dismissInboxItem(organizationId: string, id: string) {
  return setStatus(organizationId, id, { status: "dismissed" })
}

/** Puts a dismissed rate con back in the inbox. */
export async function restoreInboxItem(organizationId: string, id: string) {
  return setStatus(organizationId, id, { status: "ready" })
}

/** Records the load made from a rate con, from New Load. */
export async function markInboxUsed(
  organizationId: string,
  id: string,
  loadId: string
) {
  return setStatus(organizationId, id, { status: "used", load_id: loadId })
}

/** Has AI read a rate con again, after it failed or got stuck. */
export async function readInboxItemAgain(
  organizationId: string,
  id: string
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  const supabase = await createClient()
  const { data } = await supabase
    .from("rate_con_inbox")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle()
  if (!data) return { error: "That rate con isn't in the inbox anymore." }
  const admin = createAdminClient()
  if (!admin) return { error: "SUPABASE_SECRET_KEY isn't set." }
  await admin
    .from("rate_con_inbox")
    .update({ status: "reading", error: null })
    .eq("id", id)
  await readInboxItem(admin, id)
  refresh()
  return { ok: true }
}
