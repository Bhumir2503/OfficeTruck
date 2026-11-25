import "server-only"

import { z } from "zod"

import type { Result } from "@/lib/dq/service"

/*
 * Shared plumbing for the /api/dq endpoints: id checks, JSON bodies and
 * turning a service Result into a response. Responses are never cached:
 * they hold private records.
 */

const NO_STORE = { "Cache-Control": "private, no-store" }
const MAX_JSON_BYTES = 256 * 1024

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE })
}

export function respond<T>(result: Result<T>, okStatus = 200) {
  return result.ok
    ? json(result.data, okStatus)
    : json({ error: result.error }, result.status)
}

/** The id from the URL, or a 404 response if it isn't a UUID. */
export function idParam(value: string): string | Response {
  return z.uuid().safeParse(value).success
    ? value
    : json({ error: "Not found." }, 404)
}

/** The request's JSON body, or a 400 response. */
export async function jsonBody(request: Request): Promise<unknown | Response> {
  const length = Number(request.headers.get("content-length") ?? 0)
  if (length > MAX_JSON_BYTES) {
    return json({ error: "That's too much to send at once." }, 413)
  }
  try {
    const text = await request.text()
    if (text.length > MAX_JSON_BYTES) {
      return json({ error: "That's too much to send at once." }, 413)
    }
    return JSON.parse(text) as unknown
  } catch {
    return json({ error: "Send the details as JSON." }, 400)
  }
}

export const signInFirst = () => json({ error: "Sign in first." }, 401)
