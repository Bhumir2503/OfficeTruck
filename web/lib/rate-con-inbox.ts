import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { Resend } from "resend"

import {
  isRateConFile,
  MAX_INBOX_BYTES,
  rateConSender,
  tokenFromRecipients,
} from "@/lib/rate-con-inbox-format"
import { type ReadableType, readRateCon } from "@/lib/rate-con-reader"

// The rate con inbox (see the rate_con_inbox migration): an email to a
// company's forwarding address becomes one inbox item per rate con
// attached, each read by AI. Runs with the secret key, from the Resend
// webhook (/api/inbound/resend).

const BUCKET = "load-documents"

/** An email as the inbox needs it, with its rate con files downloaded. */
export type InboundEmail = {
  /** Resend's id for the email. */
  id: string
  from: string
  to: string[]
  subject: string | null
  text: string | null
  files: {
    /** Resend's id for the attachment. */
    id: string
    filename: string
    content_type: string
    bytes: Uint8Array
  }[]
}

/** Fetches a received email and downloads its rate con attachments. */
export async function fetchResendEmail(emailId: string): Promise<InboundEmail> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const [email, attachments] = await Promise.all([
    resend.emails.receiving.get(emailId),
    resend.emails.receiving.attachments.list({ emailId, limit: 100 }),
  ])
  if (email.error || !email.data) {
    throw new Error(email.error?.message ?? "The email couldn't be fetched.")
  }
  if (attachments.error) {
    throw new Error(attachments.error.message)
  }
  const files: InboundEmail["files"] = []
  for (const attachment of attachments.data?.data ?? []) {
    if (!isRateConFile(attachment)) continue
    const response = await fetch(attachment.download_url, {
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) continue
    files.push({
      id: attachment.id,
      filename: attachment.filename ?? "rate-con",
      content_type: attachment.content_type,
      bytes: new Uint8Array(await response.arrayBuffer()),
    })
  }
  const data = email.data
  return {
    id: data.id,
    from: data.headers?.from ?? data.from,
    to: [...data.to, ...(data.received_for ?? []), ...(data.cc ?? [])],
    subject: data.subject ?? null,
    text: data.text,
    files,
  }
}

/** The company's own addresses: its email and its members'. */
async function ownAddresses(admin: SupabaseClient, organizationId: string) {
  const [{ data: organization }, { data: members }] = await Promise.all([
    admin
      .from("organizations")
      .select("email")
      .eq("id", organizationId)
      .single(),
    admin
      .from("organization_users")
      .select("user_id")
      .eq("organization_id", organizationId),
  ])
  const addresses = organization?.email ? [organization.email] : []
  for (const member of members ?? []) {
    const { data } = await admin.auth.admin.getUserById(member.user_id)
    if (data.user?.email) addresses.push(data.user.email)
  }
  return addresses
}

function extension(type: string) {
  return type === "application/pdf"
    ? "pdf"
    : type === "image/png"
      ? "png"
      : type === "image/webp"
        ? "webp"
        : "jpg"
}

/**
 * Saves each rate con in an email to its company's inbox. Returns the new
 * items' ids, to be read; nothing for an address that isn't a company's
 * or an email with no rate con. A webhook delivered twice saves nothing
 * new.
 */
export async function ingestInboundEmail(
  admin: SupabaseClient,
  email: InboundEmail
): Promise<{ organizationId: string | null; ids: string[] }> {
  const token = tokenFromRecipients(email.to)
  if (!token) return { organizationId: null, ids: [] }
  const { data: organization } = await admin
    .from("organizations")
    .select("id")
    .eq("rate_con_inbox_token", token)
    .maybeSingle()
  if (!organization) return { organizationId: null, ids: [] }

  const sender = rateConSender(
    email.from,
    email.text,
    await ownAddresses(admin, organization.id)
  )
  const ids: string[] = []
  for (const file of email.files) {
    if (
      file.bytes.byteLength === 0 ||
      file.bytes.byteLength > MAX_INBOX_BYTES
    ) {
      continue
    }
    const { data: existing } = await admin
      .from("rate_con_inbox")
      .select("id")
      .eq("email_id", email.id)
      .eq("attachment_id", file.id)
      .maybeSingle()
    if (existing) continue

    const id = crypto.randomUUID()
    const type = file.content_type.toLowerCase().split(";")[0].trim()
    const path = `${organization.id}/inbox/${id}.${extension(type)}`
    const upload = await admin.storage
      .from(BUCKET)
      .upload(path, file.bytes, { contentType: type })
    if (upload.error) throw upload.error
    const { error } = await admin.from("rate_con_inbox").insert({
      id,
      organization_id: organization.id,
      email_id: email.id,
      attachment_id: file.id,
      from_email: (email.from ?? "").slice(0, 254),
      sender_email: sender,
      subject: email.subject?.slice(0, 300) ?? null,
      path,
      file_name: file.filename.slice(0, 200),
      content_type: type,
      size_bytes: file.bytes.byteLength,
    })
    if (error) {
      await admin.storage.from(BUCKET).remove([path])
      // Saved by a delivery running at the same time.
      if (error.code === "23505") continue
      throw error
    }
    ids.push(id)
  }
  return { organizationId: organization.id, ids }
}

/** Has AI read an inbox item, and saves what it read (or why it couldn't). */
export async function readInboxItem(admin: SupabaseClient, id: string) {
  const { data: item } = await admin
    .from("rate_con_inbox")
    .select("id, path, content_type, received_at")
    .eq("id", id)
    .maybeSingle()
  if (!item) return
  const { data: file, error } = await admin.storage
    .from(BUCKET)
    .download(item.path)
  if (error || !file) {
    await admin
      .from("rate_con_inbox")
      .update({ status: "failed", error: "The file couldn't be opened." })
      .eq("id", id)
    return
  }
  const result = await readRateCon(
    Buffer.from(await file.arrayBuffer()),
    item.content_type as ReadableType,
    (item.received_at as string).slice(0, 10)
  )
  await admin
    .from("rate_con_inbox")
    .update(
      result.ok
        ? { status: "ready", extraction: result.extraction, error: null }
        : { status: "failed", error: result.error.slice(0, 500) }
    )
    .eq("id", id)
}
