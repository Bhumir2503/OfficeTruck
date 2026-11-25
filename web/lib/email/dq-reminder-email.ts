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

export type DqReminderLine = {
  driverName: string
  item: string
  /** "Due Dec 1", "Expires Dec 1", "3 weeks overdue" */
  when: string
  overdue: boolean
}

/**
 * The day's DQ reminders for one organization, in one email to its owner.
 * Returns an error message, or null when it was sent.
 */
export async function sendDqReminderEmail(email: {
  to: string
  organizationName: string
  lines: DqReminderLine[]
  link: string
}): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return "Email sending isn't set up yet. Add RESEND_API_KEY to the environment."
  }
  const overdue = email.lines.filter((line) => line.overdue).length
  const subject =
    overdue > 0
      ? `${overdue} driver file ${overdue === 1 ? "item is" : "items are"} overdue`
      : `${email.lines.length} driver file ${email.lines.length === 1 ? "item is" : "items are"} coming due`

  const rows = email.lines
    .map(
      (line) =>
        `<tr><td style="padding:8px 0;border-top:1px solid #e5e5e5;font-size:14px;color:#171717;">${escapeHtml(line.driverName)}<br><span style="color:#525252;">${escapeHtml(line.item)}</span></td><td style="padding:8px 0 8px 12px;border-top:1px solid #e5e5e5;font-size:14px;text-align:right;white-space:nowrap;color:${line.overdue ? "#b91c1c" : "#525252"};">${escapeHtml(line.when)}</td></tr>`
    )
    .join("")
  const link = escapeHtml(email.link)

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border:1px solid #e5e5e5;border-radius:12px;">
          <tr><td style="padding:32px;">
            <p style="margin:0 0 24px;font-size:20px;font-weight:700;color:#064e3b;">OfficeTruck</p>
            <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#171717;">${escapeHtml(subject)}</h1>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#404040;">Driver qualification files at ${escapeHtml(email.organizationName)}.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
            <p style="margin:24px 0 0;"><a href="${link}" style="display:inline-block;padding:10px 16px;background-color:#059669;color:#ffffff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">Open driver files</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
  const text = [
    subject,
    "",
    `Driver qualification files at ${email.organizationName}:`,
    ...email.lines.map(
      (line) => `- ${line.driverName}: ${line.item} (${line.when})`
    ),
    "",
    email.link,
  ].join("\n")

  const { error } = await new Resend(apiKey).emails.send({
    from:
      process.env.RESEND_FROM_EMAIL || "OfficeTruck <onboarding@resend.dev>",
    to: email.to,
    subject,
    html,
    text,
  })
  return error ? error.message : null
}
