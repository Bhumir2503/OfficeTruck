import { idParam, respond, signInFirst } from "@/lib/dq/http"
import { removeEmployerCheck } from "@/lib/dq/service"
import { createRequestClient } from "@/lib/supabase/request"

/**
 * Removes an entry from the previous-employer contact log. It stays in the
 * file's history. Owners and admins.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/dq/employer-checks/[checkId]/remove">
) {
  const id = idParam((await ctx.params).checkId)
  if (id instanceof Response) return id
  const { supabase, signedIn } = await createRequestClient(request)
  if (!signedIn) return signInFirst()
  return respond(await removeEmployerCheck(supabase, id))
}
