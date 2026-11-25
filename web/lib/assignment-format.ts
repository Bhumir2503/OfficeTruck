// The rules behind the Assignment card. Shared by server and client, with no
// imports, so they can be tested on their own.

/**
 * Whether saving this assignment dispatches the load. Mirrors assign_load:
 * a load with a truck and driver that isn't dispatched to them yet — a
 * booked load, or a dispatched one whose driver is changing.
 */
export function willDispatch({
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

/** "Save and dispatch" when saving dispatches the load, otherwise "Save". */
export function saveLabel(dispatches: boolean) {
  return dispatches ? "Save and dispatch" : "Save"
}
