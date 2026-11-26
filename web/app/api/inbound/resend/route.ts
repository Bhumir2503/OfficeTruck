import { after } from "next/server"
import { Resend } from "resend"

import { json } from "@/lib/dq/http"
import {
  fetchResendEmail,
  ingestInboundEmail,
  readInboxItem,
} from "@/lib/rate-con-inbox"
import { createAdminClient } from "@/lib/supabase/admin"

// Reading a rate con takes up to a minute or so; it runs after the reply.
export const maxDuration = 300

/**
 * Resend calls this when an email arrives at a company's rate con address
 * (rc-<token>@<RATE_CON_INBOX_DOMAIN>). Checked with the webhook's signing
 * secret (RESEND_WEBHOOK_SECRET). Saves each rate con attached to the
 * company's inbox, answers, then has AI read them.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return json({ error: "RESEND_WEBHOOK_SECRET isn't set." }, 503)

  const payload = await request.text()
  let event: { type?: string; data?: { email_id?: string } }
  try {
    event = new Resend(process.env.RESEND_API_KEY).webhooks.verify({
      payload,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret: secret,
    }) as typeof event
  } catch {
    return json({ error: "Not signed by Resend." }, 401)
  }
  // Other events (sent, delivered…) have nothing for the inbox.
  if (event.type !== "email.received" || !event.data?.email_id) {
    return json({ ok: true, ignored: event.type ?? "unknown" })
  }

  const admin = createAdminClient()
  if (!admin) return json({ error: "SUPABASE_SECRET_KEY isn't set." }, 503)
  try {
    const email = await fetchResendEmail(event.data.email_id)
    const { organizationId, ids } = await ingestInboundEmail(admin, email)
    after(async () => {
      for (const id of ids) {
        await readInboxItem(admin, id).catch((error) =>
          console.error("Reading an inbox rate con failed:", error)
        )
      }
    })
    return json({ ok: true, organization: organizationId, saved: ids.length })
  } catch (error) {
    console.error("Saving an inbound rate con failed:", error)
    // A 5xx has Resend deliver it again later.
    return json(
      {
        error: error instanceof Error ? error.message : "It couldn't be saved.",
      },
      500
    )
  }
}
