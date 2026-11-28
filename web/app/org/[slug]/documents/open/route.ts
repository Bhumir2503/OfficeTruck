import { redirect } from "next/navigation"
import type { NextRequest } from "next/server"

import { FILE_BUCKETS, type FileBucket } from "@/lib/document-links"
import { getOrganization } from "@/lib/organizations"
import { createClient } from "@/lib/supabase/server"

/**
 * Opens one stored file: signs a short-lived link to it as the signed-in
 * user, so storage's own rules decide, and sends the browser there. Lists
 * link here instead of signing every file up front.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/org/[slug]/documents/open">
) {
  const { slug } = await ctx.params
  const organization = await getOrganization(slug)
  const bucket = request.nextUrl.searchParams.get("bucket")
  const path = request.nextUrl.searchParams.get("path")
  if (
    !organization ||
    !bucket ||
    !path ||
    !FILE_BUCKETS.includes(bucket as FileBucket) ||
    // Only this company's files, by their folder.
    !path.startsWith(`${organization.id}/`)
  ) {
    return new Response("File not found", { status: 404 })
  }
  const supabase = await createClient()
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 5)
  if (!data?.signedUrl) {
    return new Response("File not found", { status: 404 })
  }
  redirect(data.signedUrl)
}
