"use server"

import { refresh } from "next/cache"

import { COMPANY_DOCUMENT_KINDS } from "@/lib/company-document-format"
import { getMyOrganizations } from "@/lib/organizations"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { ok: true }

async function isMember(organizationId: string) {
  return (await getMyOrganizations()).some((org) => org.id === organizationId)
}

/** Records a file already uploaded to the company folder. */
export async function addCompanyDocument(
  organizationId: string,
  input: {
    kind: string
    title: string
    expires_on: string
    path: string
    file_name: string
    content_type: string
    size_bytes: number
  }
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  if (!(COMPANY_DOCUMENT_KINDS as readonly string[]).includes(input.kind)) {
    return { error: "Choose what kind of document it is." }
  }
  const title = input.title.trim()
  if (input.kind === "other" && !title) {
    return { error: "Say what the document is." }
  }
  if (input.expires_on && !/^\d{4}-\d{2}-\d{2}$/.test(input.expires_on)) {
    return { error: "Enter the expiration date." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("company_documents").insert({
    organization_id: organizationId,
    kind: input.kind,
    title: title ? title.slice(0, 200) : null,
    expires_on: input.expires_on || null,
    path: input.path,
    file_name: input.file_name.trim().slice(0, 200) || "Document",
    content_type: input.content_type,
    size_bytes: input.size_bytes,
  })
  if (error) {
    return {
      error:
        error.code === "23514"
          ? "That file couldn't be added. Try uploading it again."
          : error.message,
    }
  }
  refresh()
  return { ok: true }
}

/** Deletes a company document and its file. */
export async function removeCompanyDocument(
  organizationId: string,
  id: string
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: "You aren't a member of this organization." }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("company_documents")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", id)
    .select("path")
  if (error) return { error: error.message }
  if (!data.length) return { error: "That document is already gone." }
  await supabase.storage
    .from("load-documents")
    .remove(data.map((row) => row.path))
  refresh()
  return { ok: true }
}
