import { timingSafeEqual } from "node:crypto"

import { appUrl } from "@/lib/app-url"
import { today } from "@/lib/driver-format"
import { json } from "@/lib/dq/http"
import { runDqDailyJob } from "@/lib/dq/job"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * The daily DQ job: adds missing checklist items and emails due reminders.
 * Call once a day with "Authorization: Bearer <CRON_SECRET>".
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
  try {
    return json(await runDqDailyJob(admin, today(), await appUrl()))
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "The job failed." },
      500
    )
  }
}
