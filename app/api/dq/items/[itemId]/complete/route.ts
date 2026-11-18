import { today } from "@/lib/driver-format"
import { idParam, respond, signInFirst } from "@/lib/dq/http"
import { completeItem } from "@/lib/dq/service"
import { createRequestClient } from "@/lib/supabase/request"

/**
 * Completes an item that isn't completed by confirming a document: the
 * driver's signed application once reviewed, or the employer checks once
 * contacts are logged. Owners and admins.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/dq/items/[itemId]/complete">
) {
  const id = idParam((await ctx.params).itemId)
  if (id instanceof Response) return id
  const { supabase, signedIn } = await createRequestClient(request)
  if (!signedIn) return signInFirst()
  return respond(await completeItem(supabase, id, today()))
}
