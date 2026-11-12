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
  motive_vehicle_id: optional(max(50)),
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

/** A 2290 return: the tax year it's for, when it was filed, and its trucks. */
export const taxFilingSchema = z.object({
  tax_year: z.preprocess(
    (value) => (typeof value === "string" ? Number(value) : value),
    z.number("Choose a tax year.").int().min(2000).max(2100)
  ),
  filed_on: z
    .string("Enter the date it was filed.")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date it was filed."),
  truck_ids: z.array(z.uuid()).max(500),
  notes: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== "" ? value.trim() : null,
    max(2000).nullable()
  ),
})

export type TaxFilingValues = z.output<typeof taxFilingSchema>
