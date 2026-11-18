import { idParam, jsonBody, respond, signInFirst } from "@/lib/dq/http"
import { voidSignature } from "@/lib/dq/service"
import { createRequestClient } from "@/lib/supabase/request"

/**
 * Voids a signed annual review or registry-verification note, with the
 * reason, so it can be signed again. Owners and admins.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/dq/signatures/[signatureId]/void">
) {
  const id = idParam((await ctx.params).signatureId)
  if (id instanceof Response) return id
  const { supabase, signedIn } = await createRequestClient(request)
  if (!signedIn) return signInFirst()
  const body = await jsonBody(request)
  if (body instanceof Response) return body
  return respond(await voidSignature(supabase, id, body))
}
