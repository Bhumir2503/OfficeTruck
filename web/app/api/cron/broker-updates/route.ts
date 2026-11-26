import { timingSafeEqual } from "node:crypto"

import { sendQueuedBrokerUpdates } from "@/lib/broker-updates"
import { json } from "@/lib/dq/http"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Sends the queued status updates to brokers. pg_cron calls it every minute
 * while any are waiting, with "Authorization: Bearer <CRON_SECRET>".
 * `?dry=1` returns the messages without sending them.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const given = request.headers.get("authorization") ?? ""
  const expected = `Bearer ${secret}`
  if (
    !secret ||
    given.length !== expected.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  ) {
    return json({ error: "Not allowed." }, 401)
  }
  const admin = createAdminClient()
  if (!admin) return json({ error: "SUPABASE_SECRET_KEY isn't set." }, 503)
  const dryRun = new URL(request.url).searchParams.get("dry") === "1"
  try {
    const results = await sendQueuedBrokerUpdates(admin, { dryRun })
    return json({ dryRun, results })
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "The job failed." },
      500
    )
  }
}
