import "server-only"

import { Resend } from "resend"

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

/** The shared frame, matching the invitation and Supabase auth emails. */
function layout(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border:1px solid #e5e5e5;border-radius:12px;">
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 24px;font-size:20px;font-weight:700;color:#007a55;">OfficeTruck</p>
                <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#171717;">${title}</h1>
                ${body}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

async function send(to: string, subject: string, html: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return "Email sending isn't set up yet. Add RESEND_API_KEY to the environment."
  }
  const { error } = await new Resend(apiKey).emails.send({
    from:
      process.env.RESEND_FROM_EMAIL || "OfficeTruck <onboarding@resend.dev>",
    to,
    subject,
    html,
    text,
  })
  return error ? error.message : null
}

export type DispatchEmailStop = {
  kind: "pickup" | "delivery"
  location: string
  /** e.g. "Wed, Nov 18, 7:00 AM" */
  when: string
}

/** Emails a driver the link to a load they've been sent. Returns an error message, or null. */
export async function sendDispatchEmail(email: {
  to: string
  driverName: string
  organizationName: string
  reference: string
  stops: DispatchEmailStop[]
  link: string
  resent: boolean
}) {
  const first = email.driverName.split(" ")[0]
  const subject = `${email.resent ? "Updated: " : ""}Load ${email.reference} from ${email.organizationName}`
  const rows = email.stops
    .map(
      (stop) =>
        `<tr><td style="padding:6px 0;font-size:14px;color:#525252;vertical-align:top;width:76px;">${stop.kind === "pickup" ? "Pickup" : "Delivery"}</td><td style="padding:6px 0;font-size:14px;color:#171717;">${escapeHtml(stop.location)}<br><span style="color:#737373;">${escapeHtml(stop.when)}</span></td></tr>`
    )
    .join("")
  const link = escapeHtml(email.link)

  const html = layout(
    `Load ${escapeHtml(email.reference)}`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#525252;">Hi ${escapeHtml(first)}, ${escapeHtml(email.organizationName)} ${email.resent ? "updated a load you're on" : "sent you a load"}. Open it for the pickup numbers and full details, and tap Accept.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">${rows}</table>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background-color:#007a55;">
                      <a href="${link}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Open load</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#737373;">This link is just for you. Don't forward it.</p>`
  )
  const text = [
    `Hi ${first}, ${email.organizationName} ${email.resent ? "updated a load you're on" : "sent you a load"}: ${email.reference}.`,
    "",
    ...email.stops.map(
      (stop) =>
        `${stop.kind === "pickup" ? "Pickup" : "Delivery"}: ${stop.location}, ${stop.when}`
    ),
    "",
    `Open it and tap Accept: ${email.link}`,
  ].join("\n")

  return send(email.to, subject, html, text)
}

/** Tells a driver a load they were sent has been taken off their schedule. */
export async function sendUnassignedEmail(email: {
  to: string
  driverName: string
  organizationName: string
  reference: string
}) {
  const first = email.driverName.split(" ")[0]
  const subject = `Load ${email.reference} was taken off your schedule`
  const html = layout(
    `Load ${escapeHtml(email.reference)} is off your schedule`,
    `<p style="margin:0;font-size:15px;line-height:1.6;color:#525252;">Hi ${escapeHtml(first)}, ${escapeHtml(email.organizationName)} took you off load ${escapeHtml(email.reference)}. Don't go to its pickups. If you're already on the way, call dispatch.</p>`
  )
  const text = `Hi ${first}, ${email.organizationName} took you off load ${email.reference}. Don't go to its pickups. If you're already on the way, call dispatch.`
  return send(email.to, subject, html, text)
}
