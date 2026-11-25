import { today } from "@/lib/driver-format"
import { idParam, respond, signInFirst } from "@/lib/dq/http"
import { listChecklist, syncChecklist } from "@/lib/dq/service"
import { createRequestClient } from "@/lib/supabase/request"

type Context = RouteContext<"/api/dq/drivers/[driverId]/checklist">

/** The driver's checklist, as far as the signed-in person may see it. */
export async function GET(request: Request, ctx: Context) {
  const id = idParam((await ctx.params).driverId)
  if (id instanceof Response) return id
  const { supabase, signedIn } = await createRequestClient(request)
  if (!signedIn) return signInFirst()
  return respond(await listChecklist(supabase, id, today()))
}

/** Adds the items the driver's facts call for. Owners and admins. */
export async function POST(request: Request, ctx: Context) {
  const id = idParam((await ctx.params).driverId)
  if (id instanceof Response) return id
  const { supabase, signedIn } = await createRequestClient(request)
  if (!signedIn) return signInFirst()
  return respond(await syncChecklist(supabase, id, today()))
}
