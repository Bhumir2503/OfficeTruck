import { isInvitationToken } from "@/lib/schemas/invitation"

const FIXED_PATHS = ["/", "/reset-password", "/account"]

/**
 * Where a user may be sent after signing in or opening an email link: an
 * allowlist rather than any path, so links can't send people off-site or
 * somewhere unexpected. Returns null for anything else.
 */
export function safeNext(value: string | null | undefined) {
  if (!value) {
    return null
  }
  if (FIXED_PATHS.includes(value)) {
    return value
  }
  const invite = value.match(/^\/invite\/([^/?#]+)$/)
  if (invite && isInvitationToken(invite[1])) {
    return value
  }
  return null
}

/** A sign-in or sign-up URL that keeps `next` and the email to prefill, when there are any. */
export function withParams(path: string, next?: string, email?: string) {
  const params = new URLSearchParams()
  if (next && next !== "/") {
    params.set("next", next)
  }
  if (email) {
    params.set("email", email)
  }
  return params.size ? `${path}?${params}` : path
}
