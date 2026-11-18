import { today } from "@/lib/driver-format"
import { idParam, jsonBody, respond, signInFirst } from "@/lib/dq/http"
import { signItem } from "@/lib/dq/service"
import { createRequestClient } from "@/lib/supabase/request"

/**
 * Signs the item's record: the annual review or registry-verification note
 * (owners and admins), or the employment application (the driver).
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/dq/items/[itemId]/sign">
) {
  const id = idParam((await ctx.params).itemId)
  if (id instanceof Response) return id
  const { supabase, signedIn } = await createRequestClient(request)
  if (!signedIn) return signInFirst()
  const body = await jsonBody(request)
  if (body instanceof Response) return body
  return respond(await signItem(supabase, id, body, today()), 201)
}
