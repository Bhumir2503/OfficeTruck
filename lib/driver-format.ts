// Expiration dates are calendar dates with no zone, so they're read and
// printed as UTC: the server render and the browser then agree on the text.
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

/** "2027-03-04" → "Mar 4, 2027" */
export function formatDate(value: string) {
  return dateFormat.format(new Date(`${value}T00:00:00Z`))
}

/** Today's calendar date, "YYYY-MM-DD", in the server's time zone. */
export function today() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** How many days to warn ahead of an expiration. */
export const EXPIRY_WARNING_DAYS = 30

export type Expiry =
  | { state: "missing" }
  | { state: "expired"; days: number }
  | { state: "soon"; days: number }
  | { state: "ok"; days: number }

/**
 * Where an expiration date stands against `today` (both "YYYY-MM-DD"). A date
 * that is today still counts as valid: it expires at the end of the day.
 */
export function expiry(date: string | null, today: string): Expiry {
  if (!date) {
    return { state: "missing" }
  }
  const days = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000
  )
  if (days < 0) return { state: "expired", days: -days }
  if (days <= EXPIRY_WARNING_DAYS) return { state: "soon", days }
  return { state: "ok", days }
}
