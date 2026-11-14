// The rules behind the Assignment card. Shared by server and client, with no
// imports, so they can be tested on their own.

/** How long a driver has to open their link before Resend is offered. */
export const RESEND_AFTER_MS = 20 * 60 * 1000

/**
 * Whether saving this assignment notifies the driver. Mirrors assign_load:
 * a load with a truck and driver that hasn't gone to them yet — a booked
 * load, or a dispatched one whose driver is changing.
 */
export function willNotify({
  status,
  savedDriverId,
  driverId,
  truckId,
}: {
  status: string
  savedDriverId: string | null
  driverId: string | null
  truckId: string | null
}) {
  if (!driverId || !truckId) return false
  if (status === "booked") return true
  return status === "dispatched" && driverId !== savedDriverId
}

/** "Save and notify Ana" when saving notifies the driver, otherwise "Save". */
export function saveLabel(notify: boolean, driverName: string | null) {
  const first = driverName?.trim().split(/\s+/)[0]
  return notify && first ? `Save and notify ${first}` : "Save"
}

/**
 * Whether to offer Resend and Copy driver link: the driver hasn't opened the
 * link 20 minutes after being notified, or there's no way to reach them —
 * today that's no email address on file, or the email failing to send (the
 * driver app's push will join these).
 */
export function offerResend({
  sentAt,
  seenAt,
  emailTo,
  emailFailed,
  now,
}: {
  sentAt: string
  seenAt: string | null
  emailTo: string | null
  emailFailed: boolean
  now: number
}) {
  if (!emailTo || emailFailed) return true
  if (seenAt) return false
  return now - new Date(sentAt).getTime() >= RESEND_AFTER_MS
}
