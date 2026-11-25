/*
 * Calls the /api/dq endpoints from the browser, with the signed-in session's
 * cookies (or, on the driver pages, its access token). Returns the data or
 * the endpoint's error message.
 */

export type DqCall<T> = { ok: true; data: T } | { ok: false; error: string }

export async function dqFetch<T>(
  path: string,
  init: {
    method?: "GET" | "POST" | "PUT"
    json?: unknown
    form?: FormData
    token?: string
  } = {}
): Promise<DqCall<T>> {
  const headers: Record<string, string> = {}
  if (init.json !== undefined) headers["Content-Type"] = "application/json"
  if (init.token) headers.Authorization = `Bearer ${init.token}`
  try {
    const response = await fetch(`/api/dq/${path}`, {
      method:
        init.method ?? (init.json !== undefined || init.form ? "POST" : "GET"),
      headers,
      body:
        init.form ??
        (init.json !== undefined ? JSON.stringify(init.json) : undefined),
    })
    const body = (await response.json().catch(() => null)) as
      (T & { error?: string }) | null
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error ?? "Something went wrong. Try again.",
      }
    }
    return { ok: true, data: body as T }
  } catch {
    return {
      ok: false,
      error: "Couldn't reach OfficeTruck. Check your connection.",
    }
  }
}
