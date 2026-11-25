import { idParam, jsonBody, respond, signInFirst } from "@/lib/dq/http"
import { logEmployerCheck } from "@/lib/dq/service"
import { createRequestClient } from "@/lib/supabase/request"

/** Logs a contact with a previous employer. Owners and admins. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/dq/drivers/[driverId]/employer-checks">
) {
  const id = idParam((await ctx.params).driverId)
  if (id instanceof Response) return id
  const { supabase, signedIn } = await createRequestClient(request)
  if (!signedIn) return signInFirst()
  const body = await jsonBody(request)
  if (body instanceof Response) return body
  return respond(await logEmployerCheck(supabase, id, body), 201)
}
