import "server-only"

import { headers } from "next/headers"

/**
 * The app's public address, for links in emails, e.g. https://app.mydomain.com.
 * Set APP_URL in production: links built from the request's Host header could
 * otherwise point wherever a request claimed to come from.
 */
export async function appUrl() {
  const configured = process.env.APP_URL?.trim()
  if (configured) {
    return configured.replace(/\/+$/, "")
  }

  const requestHeaders = await headers()
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https")
  return `${protocol}://${host}`
}
