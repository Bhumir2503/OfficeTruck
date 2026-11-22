import { z } from "zod"

import { US_STATES } from "@/lib/schemas/organization"

// Keep these rules in step with the checks on public.trucks.

export const TRUCK_STATUSES = ["active", "out_of_service", "inactive"] as const
export type TruckStatus = (typeof TRUCK_STATUSES)[number]

export const TRUCK_STATUS_LABELS: Record<TruckStatus, string> = {
  active: "Active",
  out_of_service: "Out of service",
  inactive: "Inactive",
}

export const truckStatusSchema = z.enum(TRUCK_STATUSES, "Choose a status.")

export const OWNERSHIPS = ["owned", "leased", "owner_operator"] as const
export type Ownership = (typeof OWNERSHIPS)[number]

export const OWNERSHIP_LABELS: Record<Ownership, string> = {
  owned: "Owned",
  leased: "Leased",
  owner_operator: "Owner-operator",
}

/** Trims a text field and turns a blank one into null, so it clears the column. */
function optional(schema: z.ZodType<string>, clean = (value: string) => value) {
  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== ""
        ? clean(value.trim())
        : null,
    schema.nullable()
  )
}

const max = (length: number) =>
  z.string().max(length, `Must be ${length} characters or fewer.`)

// What the date pickers send: a calendar date, no time or zone.
const optionalDate = z.preprocess(
  (value) => (typeof value === "string" && value !== "" ? value : null),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.")
    .nullable()
)

/** A dollar amount per month from a currency input ("1,850.00"), or blank. */
const monthly = z.preprocess(
  (value) => {
    if (typeof value === "number") return value.toFixed(2)
    if (typeof value !== "string") return null
    const cleaned = value.replace(/[$,\s]/g, "")
    return cleaned === "" ? null : cleaned
  },
  z
    .string()
    .regex(/^\d{1,8}(\.\d{0,2})?$/, "Enter an amount like 1,850.00.")
    .transform(Number)
    .nullable()
)

/**
 * A whole number typed with or without commas ("80,000"), or blank, kept
 * between `min` and `max`.
 */
function optionalInteger(min: number, max: number, message: string) {
  return z.preprocess(
    (value) => {
      if (typeof value === "number") return String(value)
      if (typeof value !== "string") return null
      const cleaned = value.replace(/[,\s]/g, "")
      return cleaned === "" ? null : cleaned
    },
    z
      .string()
      .regex(/^\d+$/, message)
      .transform(Number)
      .refine((n) => n >= min && n <= max, message)
      .nullable()
  )
}

export const truckSchema = z.object({
  unit_number: z
    .string()
    .trim()
    .min(1, "Enter the unit number.")
    .max(30, "Must be 30 characters or fewer."),
  vin: optional(
    z
      .string()
      .regex(
        /^[A-HJ-NPR-Z0-9]{17}$/,
        "A VIN is 17 letters and numbers, without I, O or Q."
      ),
    (value) => value.toUpperCase().replace(/[\s-]/g, "")
  ),
  year: z.preprocess(
    (value) => {
      if (typeof value === "number") return String(value)
      return typeof value === "string" && value.trim() !== ""
        ? value.trim()
        : null
    },
    z
      .string()
      .regex(/^\d{4}$/, "Enter a 4-digit year.")
      .transform(Number)
      .refine(
        (year) => year >= 1980 && year <= new Date().getFullYear() + 2,
        "Enter a model year from 1980 on."
      )
      .nullable()
  ),
  make: optional(max(40)),
  model: optional(max(40)),
  plate_number: optional(max(15), (value) => value.toUpperCase()),
  plate_state: optional(
    z.enum(US_STATES, "Use a 2-letter US state code, e.g. TX."),
    (value) => value.toUpperCase()
  ),
  ownership: z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.enum(OWNERSHIPS, "Choose who owns the truck.").nullable()
  ),
  default_driver_id: z.preprocess(
    (value) => (typeof value === "string" && value !== "" ? value : null),
    z.uuid("Choose a driver.").nullable()
  ),
  home_base: optional(max(200)),
  registered_weight_lbs: optionalInteger(
    1000,
    200000,
    "Enter the registered weight in pounds, e.g. 80,000."
  ),
  axles: optionalInteger(2, 9, "Enter 2 to 9 axles."),
  odometer: optionalInteger(0, 5000000, "Enter the odometer in miles."),
  odometer_on: optionalDate,
  pm_interval_miles: optionalInteger(
    1000,
    100000,
    "Enter 1,000 to 100,000 miles."
  ),
  pm_interval_days: optionalInteger(7, 730, "Enter 7 to 730 days."),
  monthly_payment: monthly,
  monthly_insurance: monthly,
  monthly_other_costs: monthly,
  annual_inspection_on: optionalDate,
  registration_expires_on: optionalDate,
  plate_expires_on: optionalDate,
  notes: optional(max(2000)),
})

export type TruckInput = z.input<typeof truckSchema>
export type TruckValues = z.output<typeof truckSchema>

const COST_FIELDS = {
  monthly_payment: true,
  monthly_insurance: true,
  monthly_other_costs: true,
} as const

/**
 * Editing a truck: everything but its fixed costs and notes, which save
 * from their own boxes beside the truck page.
 */
export const truckDetailsSchema = truckSchema.omit({
  ...COST_FIELDS,
  notes: true,
})
export type TruckDetailsValues = z.output<typeof truckDetailsSchema>

/** A truck's fixed costs, from the box beside the truck page. */
export const truckCostsSchema = truckSchema.pick(COST_FIELDS)
export type TruckCostsValues = z.output<typeof truckCostsSchema>

/** Taking a truck out of service: why, and when it's expected back. */
export const outOfServiceSchema = z.object({
  reason: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== "" ? value.trim() : null,
    max(200).nullable()
  ),
  until: optionalDate,
})

export const MAINTENANCE_KINDS = [
  "preventive",
  "repair",
  "inspection",
  "tires",
  "other",
] as const
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number]

export const MAINTENANCE_LABELS: Record<MaintenanceKind, string> = {
  preventive: "Preventive maintenance",
  repair: "Repair",
  inspection: "Inspection",
  tires: "Tires",
  other: "Other",
}

/** One entry in a truck's maintenance log. Keep in step with the table. */
export const maintenanceSchema = z.object({
  done_on: z
    .string("Enter the date it was done.")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date it was done."),
  kind: z.enum(MAINTENANCE_KINDS, "Choose what kind of work it was."),
  description: z
    .string()
    .trim()
    .min(1, "Say what was done.")
    .max(500, "Must be 500 characters or fewer."),
  odometer: optionalInteger(0, 5000000, "Enter the odometer in miles."),
  cost: monthly,
  vendor: optional(max(120)),
})

export type MaintenanceInput = z.input<typeof maintenanceSchema>
export type MaintenanceValues = z.output<typeof maintenanceSchema>
