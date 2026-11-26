import "server-only"

import { Resend } from "resend"

import type { BrokerUpdateMessage } from "@/lib/broker-update-format"

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

/** "Acme Freight via OfficeTruck <updates@mydomain.com>" */
function sender(companyName: string) {
  const configured =
    process.env.RESEND_FROM_EMAIL || "OfficeTruck <onboarding@resend.dev>"
  const address = configured.match(/<([^>]+)>/)?.[1] ?? configured.trim()
  const name = companyName.replace(/["<>\\]/g, "").trim()
  return `"${name} via OfficeTruck" <${address}>`
}

/**
 * Emails one status update to the broker. Replies go to the carrier.
 * Returns an error message, or null once Resend has taken it.
 */
export async function sendBrokerUpdateEmail(email: {
  to: string[]
  replyTo: string | null
  companyName: string
  message: BrokerUpdateMessage
}): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return "Email sending isn't set up yet. Add RESEND_API_KEY to the environment."
  }
  const { subject, lines, mapUrl } = email.message
  const footer = `Sent automatically by ${email.companyName}'s dispatch. Reply to reach them.`
  const body = lines
    .filter((line) => !mapUrl || !line.includes(mapUrl))
    .map(
      (line) =>
        `<p style="margin:0 0 8px;font-size:15px;line-height:1.5;color:#262626;">${escapeHtml(line)}</p>`
    )
    .join("")
  const map = mapUrl
    ? `<p style="margin:16px 0 0;"><a href="${escapeHtml(mapUrl)}" style="display:inline-block;padding:10px 16px;background-color:#059669;color:#ffffff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">See the driver's location</a></p>`
    : ""

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border:1px solid #e5e5e5;border-radius:12px;">
          <tr><td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:13px;font-weight:600;color:#525252;">${escapeHtml(email.companyName)}</p>
            <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#171717;">${escapeHtml(subject)}</h1>
            ${body}${map}
            <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#737373;">${escapeHtml(footer)}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
  const text = [subject, "", ...lines, "", footer].join("\n")

  const { error } = await new Resend(apiKey).emails.send({
    from: sender(email.companyName),
    to: email.to,
    ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    subject,
    html,
    text,
  })
  return error ? error.message : null
}
