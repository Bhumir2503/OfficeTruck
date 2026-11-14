import type { DocumentKind } from "@/lib/load-document-format"
import { createClient } from "@/lib/supabase/server"

export type LoadDocument = {
  id: string
  kind: DocumentKind
  file_name: string
  content_type: string
  size_bytes: number
  created_at: string
  /** A link that works for an hour, or null if it couldn't be made. */
  url: string | null
}

/** A load's documents, oldest first, each with a short-lived link to view it. */
export async function getLoadDocuments(
  organizationId: string,
  loadId: string
): Promise<LoadDocument[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("load_documents")
    .select("id, kind, path, file_name, content_type, size_bytes, created_at")
    .eq("organization_id", organizationId)
    .eq("load_id", loadId)
    .order("created_at")
  if (error) {
    throw error
  }
  const rows = data as (Omit<LoadDocument, "url"> & { path: string })[]
  const urls = new Map<string, string>()
  if (rows.length) {
    const { data: signed } = await supabase.storage
      .from("load-documents")
      .createSignedUrls(
        rows.map((row) => row.path),
        60 * 60
      )
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) {
        urls.set(item.path, item.signedUrl)
      }
    }
  }
  return rows.map(({ path, ...row }) => ({
    ...row,
    url: urls.get(path) ?? null,
  }))
}
