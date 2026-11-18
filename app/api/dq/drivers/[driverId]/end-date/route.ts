import { idParam, jsonBody, respond, signInFirst } from "@/lib/dq/http"
import { setEndDate } from "@/lib/dq/service"
import { createRequestClient } from "@/lib/supabase/request"

/** Sets the day the driver left. Owners and admins. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/dq/drivers/[driverId]/end-date">
) {
  const id = idParam((await ctx.params).driverId)
  if (id instanceof Response) return id
  const { supabase, signedIn } = await createRequestClient(request)
  if (!signedIn) return signInFirst()
  const body = await jsonBody(request)
  if (body instanceof Response) return body
  return respond(await setEndDate(supabase, id, body))
}
