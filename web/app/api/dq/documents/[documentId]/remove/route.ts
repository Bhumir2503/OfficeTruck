import { idParam, respond, signInFirst } from "@/lib/dq/http"
import { removeDocument } from "@/lib/dq/service"
import { createRequestClient } from "@/lib/supabase/request"

/**
 * Takes an unconfirmed upload out of the file. It stays in storage and the
 * file's history. Owners and admins.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/dq/documents/[documentId]/remove">
) {
  const id = idParam((await ctx.params).documentId)
  if (id instanceof Response) return id
  const { supabase, signedIn } = await createRequestClient(request)
  if (!signedIn) return signInFirst()
  return respond(await removeDocument(supabase, id))
}
