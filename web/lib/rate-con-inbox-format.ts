// Shared by server and tests: no server-only imports here.
//
// The rate con inbox's addressing and sorting: which company an email is
// for, which attachments are rate cons, and who really sent it.

/** Files AI can read, as on New Load. */
export const INBOX_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const

/** Images smaller than this are logos and signatures, not rate cons. */
const MIN_IMAGE_BYTES = 30 * 1024
export const MAX_INBOX_BYTES = 20 * 1024 * 1024

/** "rc-<token>@<domain>": where a company forwards its rate cons. */
export function inboxAddress(token: string, domain: string) {
  return `rc-${token}@${domain}`
}

/**
 * The company token in the addresses an email was sent to, or null.
 * Matches "rc-<token>@…" anywhere in the list, with or without a name.
 */
export function tokenFromRecipients(addresses: string[]) {
  for (const address of addresses) {
    const match = address.match(/(?:^|[<\s"])rc-([a-z0-9]{8,32})@/i)
    if (match) return match[1].toLowerCase()
  }
  return null
}

/** "Name <a@b.com>" or "a@b.com" → "a@b.com", lowercased. */
export function bareAddress(value: string) {
  const match =
    value.match(/<([^<>@\s]+@[^<>\s]+)>/) ??
    value.match(/([^\s<>"]+@[^\s<>"]+)/)
  return match ? match[1].toLowerCase() : null
}

/**
 * Whether an attachment is worth reading as a rate con: a PDF or photo,
 * not a small inline image (a logo in someone's signature), not too big.
 */
export function isRateConFile(file: {
  filename?: string | null
  content_type: string
  size?: number | null
  content_disposition?: string | null
}) {
  const type = file.content_type.toLowerCase().split(";")[0].trim()
  if (!(INBOX_TYPES as readonly string[]).includes(type)) return false
  if (file.size != null && file.size > MAX_INBOX_BYTES) return false
  if (type === "application/pdf") return true
  if (file.content_disposition === "inline") return false
  return file.size == null || file.size >= MIN_IMAGE_BYTES
}

/**
 * Who sent the rate con: the email's sender, unless that's someone at the
 * company forwarding it, in which case the forwarded message's "From:"
 * line (the broker's address) when one can be found.
 */
export function rateConSender(
  from: string,
  text: string | null,
  ownAddresses: string[]
) {
  const own = new Set(ownAddresses.map((address) => address.toLowerCase()))
  const sender = bareAddress(from)
  if (sender && !own.has(sender)) return sender
  for (const line of (text ?? "").split(/\r?\n/)) {
    const match = line.match(/^[\s>]*From:\s*(.+)$/i)
    if (!match) continue
    const address = bareAddress(match[1])
    if (address && !own.has(address)) return address
  }
  return sender
}
