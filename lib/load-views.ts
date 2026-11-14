import type { LoadStatus } from "@/lib/schemas/load"

/** The work queues on the loads table: what each load needs next. */
export const LOAD_VIEWS = [
  "needs_driver",
  "ready_to_send",
  "on_the_road",
  "needs_billing",
  "waiting_on_pay",
] as const

export type LoadView = (typeof LOAD_VIEWS)[number]

export const LOAD_VIEW_LABELS: Record<LoadView, string> = {
  needs_driver: "Needs driver",
  ready_to_send: "Ready to send",
  on_the_road: "On the road",
  needs_billing: "Needs billing",
  waiting_on_pay: "Waiting on pay",
}

type ViewLoad = {
  status: LoadStatus
  driver_id: string | null
  truck_id: string | null
}

/**
 * A booked load can only be sent once it has both a truck and a driver, so
 * one missing either still needs assigning.
 */
export function inView(view: LoadView, load: ViewLoad) {
  const assigned = !!load.driver_id && !!load.truck_id
  switch (view) {
    case "needs_driver":
      return load.status === "booked" && !assigned
    case "ready_to_send":
      return load.status === "booked" && assigned
    case "on_the_road":
      return load.status === "dispatched" || load.status === "loaded"
    case "needs_billing":
      return load.status === "delivered"
    case "waiting_on_pay":
      return load.status === "invoiced" || load.status === "factored"
  }
}

/** The one queue a load is in, or null once it's paid or ended. */
export function viewOf(load: ViewLoad): LoadView | null {
  return LOAD_VIEWS.find((view) => inView(view, load)) ?? null
}

/** When a load waiting on pay is due, and how late it is. */
export type PaymentDue = {
  /** "YYYY-MM-DD" */
  due_on: string
  /** Days past due; 0 or less isn't overdue yet. */
  days_late: number
}

const DAY = 24 * 60 * 60 * 1000

/**
 * Due date = when it was invoiced (or delivered, for loads invoiced before
 * status changes were logged) plus the broker's payment terms.
 */
export function paymentDue(
  billedOn: string,
  termsDays: number,
  today: Date
): PaymentDue {
  const billed = Date.UTC(
    Number(billedOn.slice(0, 4)),
    Number(billedOn.slice(5, 7)) - 1,
    Number(billedOn.slice(8, 10))
  )
  const due = billed + termsDays * DAY
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return {
    due_on: new Date(due).toISOString().slice(0, 10),
    days_late: Math.round((now - due) / DAY),
  }
}
