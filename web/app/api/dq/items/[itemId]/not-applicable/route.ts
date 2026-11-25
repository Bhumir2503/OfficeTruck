import { idParam, jsonBody, respond, signInFirst } from "@/lib/dq/http"
import { markNotApplicable } from "@/lib/dq/service"
import { createRequestClient } from "@/lib/supabase/request"

/** Marks an item not applicable, with the reason. Owners and admins. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/dq/items/[itemId]/not-applicable">
) {
  const id = idParam((await ctx.params).itemId)
  if (id instanceof Response) return id
  const { supabase, signedIn } = await createRequestClient(request)
  if (!signedIn) return signInFirst()
  const body = await jsonBody(request)
  if (body instanceof Response) return body
  return respond(await markNotApplicable(supabase, id, body))
}
