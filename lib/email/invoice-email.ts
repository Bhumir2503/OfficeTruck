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

/** "Acme Freight via OfficeTruck <invoices@mydomain.com>", from the configured sender's address. */
function sender(companyName: string) {
  const configured =
    process.env.RESEND_FROM_EMAIL || "OfficeTruck <onboarding@resend.dev>"
  const address = configured.match(/<([^>]+)>/)?.[1] ?? configured.trim()
  // Quotes and angle brackets would break the header.
  const name = companyName.replace(/["<>\\]/g, "").trim()
  return `"${name} via OfficeTruck" <${address}>`
}

export type InvoiceEmail = {
  to: string[]
  /** Replies go to the carrier, not OfficeTruck. */
  replyTo: string | null
  companyName: string
  number: number
  reference: string
  total: string
  /** "Dec 15, 2026" */
  dueOn: string
  /** Set when the invoice is factored: who to pay. */
  factoringName: string | null
  /** A note typed by whoever sent it. */
  message: string | null
  attachments: { filename: string; content: Uint8Array }[]
}

/**
 * Emails the invoice packet to the broker or factoring company. Returns an
 * error message, or null once Resend has taken it.
 */
export async function sendInvoiceEmail(email: InvoiceEmail) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return "Email sending isn't set up yet. Add RESEND_API_KEY to the environment, or download the packet and send it yourself."
  }

  const company = escapeHtml(email.companyName)
  const subject = `Invoice ${email.number} for load ${email.reference} from ${email.companyName}`
  const intro = `Attached is invoice ${email.number} for load ${email.reference}, with the rate confirmation and signed delivery paperwork.`
  const payTo = email.factoringName
    ? `This invoice has been assigned to ${email.factoringName}. Please pay ${email.factoringName} directly.`
    : `Please include invoice ${email.number} with your payment.`

  const rows: [string, string][] = [
    ["Invoice", String(email.number)],
    ["Load", email.reference],
    ["Amount due", email.total],
    ["Due", email.dueOn],
  ]

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e5e5e5;border-radius:12px;">
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 24px;font-size:18px;font-weight:700;color:#171717;">${company}</p>
                <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#171717;">Invoice ${email.number}</h1>
                ${
                  email.message
                    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#171717;white-space:pre-line;">${escapeHtml(email.message)}</p>`
                    : ""
                }
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#525252;">${escapeHtml(intro)}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;width:100%;border-top:1px solid #e5e5e5;">
                  ${rows
                    .map(
                      ([label, value]) =>
                        `<tr><td style="padding:8px 0;font-size:14px;color:#737373;border-bottom:1px solid #e5e5e5;">${label}</td><td style="padding:8px 0;font-size:14px;color:#171717;text-align:right;font-weight:600;border-bottom:1px solid #e5e5e5;">${escapeHtml(value)}</td></tr>`
                    )
                    .join("")}
                </table>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#525252;">${escapeHtml(payTo)}</p>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#a3a3a3;">Sent with OfficeTruck. Reply to this email to reach ${company}.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = [
    ...(email.message ? [email.message, ""] : []),
    intro,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    payTo,
    "",
    `- ${email.companyName}`,
  ].join("\n")

  const { error } = await new Resend(apiKey).emails.send({
    from: sender(email.companyName),
    to: email.to,
    ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    subject,
    html,
    text,
    attachments: email.attachments.map((file) => ({
      filename: file.filename,
      content: Buffer.from(file.content),
    })),
  })
  return error ? error.message : null
}
