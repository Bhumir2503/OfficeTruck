import { z } from "zod"

// Keep these rules in step with the checks on public.loads, load_stops and
// load_charges, and the save_load_stops / create_load functions.

/** The main flow, in order. */
export const LOAD_FLOW = [
  "booked",
  "dispatched",
  "loaded",
  "delivered",
  "invoiced",
  "paid",
  "factored",
] as const

/** Off the main flow: the load fell through. */
export const LOAD_ENDINGS = ["cancelled", "tonu"] as const

export const LOAD_STATUSES = [...LOAD_FLOW, ...LOAD_ENDINGS] as const
export type LoadStatus = (typeof LOAD_STATUSES)[number]

export const LOAD_STATUS_LABELS: Record<LoadStatus, string> = {
  booked: "Booked",
  dispatched: "Dispatched",
  loaded: "Loaded",
  delivered: "Delivered",
  invoiced: "Invoiced",
  paid: "Paid",
  factored: "Factored",
  cancelled: "Canceled",
  tonu: "TONU",
}

/** Statuses that need a truck and driver on the load. */
export const STATUSES_NEEDING_ASSIGNMENT: LoadStatus[] = [
  "dispatched",
  "loaded",
  "delivered",
]

/** A load in one of these doesn't count toward revenue or miles. */
export const isFallenThrough = (status: LoadStatus) =>
  status === "cancelled" || status === "tonu"

export const loadStatusSchema = z.enum(LOAD_STATUSES, "Choose a status.")

/** Why a load was canceled. Required to cancel one. */
export const cancelLoadSchema = z.object({
  reason: z
    .string("Give a reason for canceling.")
    .trim()
    .min(1, "Give a reason for canceling.")
    .max(500, "Must be 500 characters or fewer."),
})
export type CancelLoadValues = z.output<typeof cancelLoadSchema>

export const EQUIPMENT_TYPES = [
  "dry_van",
  "reefer",
  "flatbed",
  "step_deck",
  "conestoga",
  "power_only",
  "other",
] as const
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number]

export const EQUIPMENT_LABELS: Record<EquipmentType, string> = {
  dry_van: "Dry van",
  reefer: "Reefer",
  flatbed: "Flatbed",
  step_deck: "Step deck",
  conestoga: "Conestoga",
  power_only: "Power only",
  other: "Other",
}

export const STOP_KINDS = ["pickup", "delivery"] as const
export type StopKind = (typeof STOP_KINDS)[number]

export const STOP_KIND_LABELS: Record<StopKind, string> = {
  pickup: "Pickup",
  delivery: "Delivery",
}

export const CHARGE_KINDS = [
  "linehaul",
  "fuel_surcharge",
  "detention",
  "lumper",
  "tonu",
  "layover",
  "stop_off",
  "other",
] as const
export type ChargeKind = (typeof CHARGE_KINDS)[number]

export const CHARGE_KIND_LABELS: Record<ChargeKind, string> = {
  linehaul: "Linehaul",
  fuel_surcharge: "Fuel surcharge",
  detention: "Detention",
  lumper: "Lumper",
  tonu: "TONU",
  layover: "Layover",
  stop_off: "Stop-off",
  other: "Other",
}

/** Run up on the road, added by a person after booking. */
export const ACCESSORIAL_KINDS = [
  "detention",
  "lumper",
  "tonu",
  "layover",
  "stop_off",
  "other",
] as const satisfies readonly ChargeKind[]

/**
 * Turns form data with keys like "stops.0.location" into nested objects and
 * arrays. Already-nested values (the server re-checking parsed values) pass
 * through unchanged.
 */
export function unflatten(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value
  }
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    const parts = key.split(".")
    let node = out as Record<string, unknown>
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        node[part] = entry
        return
      }
      node[part] ??= /^\d+$/.test(parts[index + 1]) ? [] : {}
      node = node[part] as Record<string, unknown>
    })
  }
  // Drop any holes left by missing indexes.
  for (const [key, entry] of Object.entries(out)) {
    if (Array.isArray(entry)) {
      out[key] = entry.filter(() => true)
    }
  }
  return out
}

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

/** "" or missing → null, for selects and hidden ids. */
const blankToNull = (value: unknown) =>
  typeof value === "string" && value !== "" ? value : null

// What a datetime-local input sends: wall-clock time at the stop, no zone.
// Values read back from the database have seconds; those are trimmed.
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
const trimSeconds = (value: unknown) =>
  typeof value === "string" ? value.slice(0, 16) : value

const dateTime = (message: string) =>
  z.preprocess(trimSeconds, z.string(message).regex(DATE_TIME, message))

const optionalDateTime = z.preprocess(
  (value) => (typeof value === "string" && value !== "" ? value : null),
  z
    .string()
    .transform((value) => value.slice(0, 16))
    .pipe(z.string().regex(DATE_TIME, "Enter a valid date and time."))
    .nullable()
)

/**
 * A dollar amount typed with or without "$" and commas, or a number when the
 * server re-checks parsed values. Blank is null when `optional`.
 */
function money(message: string, { optional = false } = {}) {
  const amount = z
    .string()
    .regex(/^\d{1,8}(\.\d{0,2})?$/, "Enter an amount like 2,450.00.")
    .transform(Number)
  return z.preprocess(
    (value) => {
      if (typeof value === "number") return value.toFixed(2)
      if (typeof value !== "string") return optional ? null : value
      const cleaned = value.replace(/[$,\s]/g, "")
      return cleaned === "" && optional ? null : cleaned
    },
    optional
      ? amount.nullable()
      : z.string(message).min(1, { message, abort: true }).pipe(amount)
  )
}

/** Whole numbers typed with or without commas ("1,240"), up to `max`. */
function wholeNumber(message: string, max: number, unit: string) {
  return z.preprocess(
    (value) => {
      if (typeof value === "number") return String(value)
      if (typeof value !== "string") return null
      const cleaned = value.replace(/[,\s]/g, "")
      return cleaned === "" ? null : cleaned
    },
    z
      .string()
      .regex(/^\d{1,6}$/, message)
      .transform(Number)
      .refine(
        (value) => value <= max,
        `Must be ${max.toLocaleString("en-US")} ${unit} or fewer.`
      )
      .nullable()
  )
}

const miles = wholeNumber("Enter whole miles, like 1,240.", 100000, "miles")

const id = (message: string) =>
  z.preprocess(blankToNull, z.uuid(message).nullable())

const driverId = id("Choose a driver.")
const truckId = id("Choose a truck.")

/** The truck, driver and miles on a load, which can be changed after it's added. */
export const loadAssignmentSchema = z.object({
  truck_id: truckId,
  driver_id: driverId,
  miles: miles,
  empty_miles: miles,
})

export type LoadAssignmentInput = z.input<typeof loadAssignmentSchema>
export type LoadAssignmentValues = z.output<typeof loadAssignmentSchema>

// The broker on a load: one of yours (broker_id), or just a name, plus who
// sent the rate con. Shared by New Load and the load page.
const brokerFields = {
  broker_id: id("Choose a broker."),
  broker_name: required("the broker", 120),
  rate_con_from: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== ""
        ? value.trim().toLowerCase()
        : null,
    z.email("Enter the sender's full email address.").nullable()
  ),
}

/** The broker on a load, which can be changed after it's booked. */
export const loadBrokerSchema = z.object(brokerFields)
export type LoadBrokerValues = z.output<typeof loadBrokerSchema>

/** What's being hauled, from the rate con. Editable after booking. */
const freightFields = {
  reference_numbers: optional(200),
  equipment: z.preprocess(
    blankToNull,
    z.enum(EQUIPMENT_TYPES, "Choose the equipment.").nullable()
  ),
  commodity: optional(120),
  weight_lbs: wholeNumber("Enter whole pounds, like 42,000.", 200000, "lbs"),
  trailer_number: optional(30),
  notes: optional(2000),
}

export const loadDetailsSchema = z.object({
  reference: required("a load number", 50),
  ...freightFields,
})
export type LoadDetailsValues = z.output<typeof loadDetailsSchema>

// ------------------------------------------------------------ Stops -----

const stopSchema = z
  .object({
    id: id("That stop isn't on this load anymore."),
    kind: z.enum(STOP_KINDS, "Choose pickup or delivery."),
    location: required("the address", 200),
    appointment_start: dateTime("Enter the appointment date and time."),
    appointment_end: optionalDateTime,
    stop_number: optional(50),
  })
  // The strings are zero-padded and the same length, so they compare as dates.
  .refine(
    (stop) =>
      !stop.appointment_end || stop.appointment_end >= stop.appointment_start,
    {
      path: ["appointment_end"],
      message: "Must be after the start of the window.",
    }
  )

export type StopValues = z.output<typeof stopSchema>

const stopsSchema = z
  .array(stopSchema)
  .min(2, "A load needs a pickup and a delivery.")
  .max(50, "A load can have at most 50 stops.")
  .superRefine((stops, ctx) => {
    if (stops[0]?.kind !== "pickup") {
      ctx.addIssue({
        code: "custom",
        path: [0, "kind"],
        message: "The first stop must be a pickup.",
      })
    }
    if (stops.at(-1)?.kind !== "delivery") {
      ctx.addIssue({
        code: "custom",
        path: [stops.length - 1, "kind"],
        message: "The last stop must be a delivery.",
      })
    }
    stops.forEach((stop, index) => {
      const previous = stops[index - 1]
      if (previous && stop.appointment_start < previous.appointment_start) {
        ctx.addIssue({
          code: "custom",
          path: [index, "appointment_start"],
          message: "Must be after the stop before it.",
        })
      }
    })
  })

export const loadStopsSchema = z.preprocess(
  unflatten,
  z.object({ stops: stopsSchema })
)
export type LoadStopsValues = z.output<typeof loadStopsSchema>

// ---------------------------------------------------------- Charges -----

const chargeSchema = z.object({
  kind: z.enum(CHARGE_KINDS, "Choose a charge."),
  description: optional(120),
  amount: money("Enter the amount."),
})
export type ChargeValues = z.output<typeof chargeSchema>

const isBlankRow = (row: unknown) => {
  if (!row || typeof row !== "object") return true
  const { amount, description } = row as Record<string, unknown>
  return (
    (amount === undefined || amount === null || amount === "") &&
    (typeof description !== "string" || description.trim() === "")
  )
}

const chargesSchema = z.preprocess(
  // Rows left blank (an unused fuel surcharge line, say) are dropped.
  (value) =>
    Array.isArray(value) ? value.filter((row) => !isBlankRow(row)) : value,
  z
    .array(chargeSchema, "Add at least one charge.")
    .min(1, "Add at least one charge.")
    .max(20, "A load can have at most 20 charges.")
)

const detentionFields = {
  detention_free_hours: z.preprocess(
    (value) => {
      if (typeof value === "number") return String(value)
      return typeof value === "string" && value.trim() !== ""
        ? value.trim()
        : null
    },
    z
      .string()
      .regex(/^\d{1,2}(\.\d)?$/, "Enter hours like 2 or 1.5.")
      .transform(Number)
      .refine((value) => value <= 48, "Must be 48 hours or fewer.")
      .nullable()
  ),
  detention_rate: money("Enter the hourly rate.", { optional: true }),
}

/** Detention terms are both set or both blank. */
function checkDetentionTerms(
  values: {
    detention_free_hours: number | null
    detention_rate: number | null
  },
  ctx: z.RefinementCtx
) {
  if (
    (values.detention_free_hours === null) !==
    (values.detention_rate === null)
  ) {
    ctx.addIssue({
      code: "custom",
      path: [
        values.detention_free_hours === null
          ? "detention_free_hours"
          : "detention_rate",
      ],
      message: "Enter both the free hours and the hourly rate, or neither.",
    })
  }
}

/** A new set of rate con charges, e.g. from a revised rate con. */
export const rateRevisionSchema = z.preprocess(
  unflatten,
  z
    .object({
      charges: chargesSchema,
      ...detentionFields,
      note: optional(500),
    })
    .superRefine(checkDetentionTerms)
)
export type RateRevisionValues = z.output<typeof rateRevisionSchema>

/** A charge run up on the road, added by a person. */
export const accessorialSchema = z.object({
  kind: z.enum(ACCESSORIAL_KINDS, "Choose a charge."),
  description: optional(120),
  amount: money("Enter the amount."),
})
export type AccessorialValues = z.output<typeof accessorialSchema>

// -------------------------------------------------------- New load -----

export const loadSchema = z.preprocess(
  unflatten,
  z
    .object({
      reference: required("a load number", 50),
      ...brokerFields,
      ...freightFields,
      stops: stopsSchema,
      charges: chargesSchema,
      ...detentionFields,
      truck_id: truckId,
      driver_id: driverId,
      miles: miles,
      empty_miles: miles,
    })
    .superRefine(checkDetentionTerms)
)

export type LoadValues = z.output<typeof loadSchema>
