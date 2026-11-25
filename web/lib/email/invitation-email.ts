import "server-only"

import { Resend } from "resend"

const ROLE_LABELS = { admin: "an admin", member: "a member" }

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

const expiryFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

type InvitationEmail = {
  to: string
  organizationName: string
  inviterName: string
  role: "admin" | "member"
  link: string
  expiresAt: Date
}

/** The invitation email, matching the Supabase auth email templates. */
function renderInvitationEmail(email: InvitationEmail) {
  const organization = escapeHtml(email.organizationName)
  const inviter = escapeHtml(email.inviterName)
  const role = ROLE_LABELS[email.role]
  const expires = expiryFormat.format(email.expiresAt)
  const link = escapeHtml(email.link)

  const subject = `${email.inviterName} invited you to join ${email.organizationName} on OfficeTruck`

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border:1px solid #e5e5e5;border-radius:12px;">
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 24px;font-size:20px;font-weight:700;color:#007a55;">OfficeTruck</p>
                <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#171717;">Join ${organization} on OfficeTruck</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#525252;"><strong style="color:#171717;">${inviter}</strong> invited you to join <strong style="color:#171717;">${organization}</strong> as ${role}. Accept to start working with your team.</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background-color:#007a55;">
                      <a href="${link}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Accept invitation</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#737373;">This invitation was sent to ${escapeHtml(email.to)} and expires on ${expires}. If you weren't expecting it, you can ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = `${email.inviterName} invited you to join ${email.organizationName} on OfficeTruck as ${role}.

Accept the invitation: ${email.link}

This invitation was sent to ${email.to} and expires on ${expires}. If you weren't expecting it, you can ignore this email.`

  return { subject, html, text }
}

/** Sends the invitation email. Returns an error message if it couldn't be sent. */
export async function sendInvitationEmail(
  email: InvitationEmail
): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return "Email sending isn't set up yet. Add RESEND_API_KEY to the environment."
  }

  const { subject, html, text } = renderInvitationEmail(email)
  const { error } = await new Resend(apiKey).emails.send({
    from:
      process.env.RESEND_FROM_EMAIL || "OfficeTruck <onboarding@resend.dev>",
    to: email.to,
    subject,
    html,
    text,
  })

  return error ? `Couldn't send the invitation email: ${error.message}` : null
}
