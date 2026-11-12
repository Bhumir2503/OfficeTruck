import { z } from "zod"

// Keep these rules in step with the checks on public.loads.

export const LOAD_STATUSES = [
  "booked",
  "in_transit",
  "delivered",
  "invoiced",
  "cancelled",
] as const
export type LoadStatus = (typeof LOAD_STATUSES)[number]

export const LOAD_STATUS_LABELS: Record<LoadStatus, string> = {
  booked: "Booked",
  in_transit: "In transit",
  delivered: "Delivered",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
}

export const loadStatusSchema = z.enum(LOAD_STATUSES, "Choose a status.")

function required(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `Enter ${label}.`)
    .max(max, `Must be ${max} characters or fewer.`)
}

/** Trims a text field and turns a blank one into null. */
function optional(max: number) {
  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== "" ? value.trim() : null,
    z.string().max(max, `Must be ${max} characters or fewer.`).nullable()
  )
}

// What a datetime-local input sends: wall-clock time at the stop, no zone.
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

const dateTime = (message: string) => z.string().regex(DATE_TIME, message)

const optionalDateTime = z.preprocess(
  (value) => (typeof value === "string" && value !== "" ? value : null),
  dateTime("Enter a valid date and time.").nullable()
)

// What the driver picker sends: a driver's id, or "" for no driver.
const driverId = z.preprocess(
  (value) => (typeof value === "string" && value !== "" ? value : null),
  z.uuid("Choose a driver.").nullable()
)

// Whole miles, typed with or without commas ("1,240"); a number when the
// server re-checks parsed values.
const miles = z.preprocess(
  (value) => {
    if (typeof value === "number") return String(value)
    if (typeof value !== "string") return null
    const cleaned = value.replace(/[,\s]/g, "")
    return cleaned === "" ? null : cleaned
  },
  z
    .string()
    .regex(/^\d{1,6}$/, "Enter whole miles, like 1,240.")
    .transform(Number)
    .refine((value) => value <= 100000, "Must be 100,000 miles or fewer.")
    .nullable()
)

/** The driver and miles on a load, which can be changed after it's added. */
export const loadAssignmentSchema = z.object({
  driver_id: driverId,
  miles: miles,
})

export type LoadAssignmentInput = z.input<typeof loadAssignmentSchema>
export type LoadAssignmentValues = z.output<typeof loadAssignmentSchema>

export const loadSchema = z
  .object({
    reference: required("a load number", 50),
    broker_name: required("the broker", 120),
    pickup_location: required("the pickup location", 200),
    pickup_start: dateTime("Enter the pickup date and time."),
    pickup_end: optionalDateTime,
    delivery_location: required("the delivery location", 200),
    delivery_start: dateTime("Enter the delivery date and time."),
    delivery_end: optionalDateTime,
    // A string from the form; a number when the server re-checks parsed values.
    rate: z
      .preprocess(
        (value) => (typeof value === "number" ? value.toFixed(2) : value),
        z.string("Enter the rate.")
      )
      .transform((value) => value.replace(/[$,\s]/g, ""))
      .pipe(
        z
          .string()
          .min(1, { message: "Enter the rate.", abort: true })
          .regex(/^\d{1,8}(\.\d{0,2})?$/, "Enter an amount like 2,450.00.")
      )
      .transform(Number),
    driver_id: driverId,
    miles: miles,
    truck: optional(50),
    notes: optional(2000),
  })
  // The strings are zero-padded and the same length, so they compare as dates.
  .refine((v) => !v.pickup_end || v.pickup_end >= v.pickup_start, {
    path: ["pickup_end"],
    message: "Must be after the start of the window.",
  })
  .refine((v) => v.delivery_start >= v.pickup_start, {
    path: ["delivery_start"],
    message: "Must be after the pickup.",
  })
  .refine((v) => !v.delivery_end || v.delivery_end >= v.delivery_start, {
    path: ["delivery_end"],
    message: "Must be after the start of the window.",
  })

export type LoadInput = z.input<typeof loadSchema>
export type LoadValues = z.output<typeof loadSchema>
