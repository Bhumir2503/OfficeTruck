import { idParam, jsonBody, respond, signInFirst } from "@/lib/dq/http"
import { saveApplication } from "@/lib/dq/service"
import { createRequestClient } from "@/lib/supabase/request"

/**
 * Saves the driver's employment application before they sign it. The SSN
 * and date of birth are encrypted before saving; only the SSN's last 4
 * digits come back. The driver only.
 */
export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/dq/items/[itemId]/application">
) {
  const id = idParam((await ctx.params).itemId)
  if (id instanceof Response) return id
  const { supabase, signedIn } = await createRequestClient(request)
  if (!signedIn) return signInFirst()
  const body = await jsonBody(request)
  if (body instanceof Response) return body
  return respond(await saveApplication(supabase, id, body))
}
