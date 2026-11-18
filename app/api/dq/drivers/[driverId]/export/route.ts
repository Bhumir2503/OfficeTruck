import type { NextRequest } from "next/server"

import { today } from "@/lib/driver-format"
import { exportFile } from "@/lib/dq/export"
import { idParam, json, signInFirst } from "@/lib/dq/http"
import { createRequestClient } from "@/lib/supabase/request"

/**
 * The driver's file as one PDF. ?file=dq (the default), investigation or
 * drug_alcohol; the last two for owners and admins only. ?download=1 saves
 * it instead of opening it.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/dq/drivers/[driverId]/export">
) {
  const id = idParam((await ctx.params).driverId)
  if (id instanceof Response) return id
  const { supabase, signedIn } = await createRequestClient(request)
  if (!signedIn) return signInFirst()
  const params = request.nextUrl.searchParams
  const result = await exportFile(supabase, id, params.get("file"), today())
  if (!result.ok) return json({ error: result.error }, result.status)
  const disposition = params.get("download") === "1" ? "attachment" : "inline"
  return new Response(Buffer.from(result.data.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${result.data.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
