import { today } from "@/lib/driver-format"
import { idParam, jsonBody, respond, signInFirst } from "@/lib/dq/http"
import { confirmDocument } from "@/lib/dq/service"
import { createRequestClient } from "@/lib/supabase/request"

/**
 * Confirms or corrects a document's details (what the AI read is only a
 * suggestion) and completes its item. Owners and admins.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/dq/documents/[documentId]/confirm">
) {
  const id = idParam((await ctx.params).documentId)
  if (id instanceof Response) return id
  const { supabase, signedIn } = await createRequestClient(request)
  if (!signedIn) return signInFirst()
  const body = await jsonBody(request)
  if (body instanceof Response) return body
  return respond(await confirmDocument(supabase, id, body, today()))
}
