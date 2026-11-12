import { z } from "zod"

import { US_STATES } from "@/lib/schemas/organization"

// Keep these rules in step with the checks on public.drivers.

export const DRIVER_STATUSES = ["active", "inactive"] as const
export type DriverStatus = (typeof DRIVER_STATUSES)[number]

export const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  active: "Active",
  inactive: "Inactive",
}

export const driverStatusSchema = z.enum(DRIVER_STATUSES, "Choose a status.")

export const PAY_TYPES = ["per_mile", "percent", "flat"] as const
export type PayType = (typeof PAY_TYPES)[number]

export const PAY_TYPE_LABELS: Record<PayType, string> = {
  per_mile: "Per mile",
  percent: "% of load",
  flat: "Flat per load",
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

export const driverSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(1, "Enter the driver's name.")
      .max(120, "Must be 120 characters or fewer."),
    phone: optional(
      max(30).regex(/^[0-9+().\-\s]+$/, "Enter a valid phone number.")
    ),
    email: optional(z.email("Enter a valid email address.")),
    cdl_number: optional(max(30), (value) => value.toUpperCase()),
    cdl_state: optional(
      z.enum(US_STATES, "Use a 2-letter US state code, e.g. TX."),
      (value) => value.toUpperCase()
    ),
    cdl_expires_on: optionalDate,
    medical_card_expires_on: optionalDate,
    annual_review_on: optionalDate,
    clearinghouse_query_on: optionalDate,
    pay_type: z.preprocess(
      (value) => (value === "" || value === undefined ? null : value),
      z.enum(PAY_TYPES, "Choose how the driver is paid.").nullable()
    ),
    // A string from the form ("0.65", "1,200"); a number when the server
    // re-checks parsed values.
    pay_rate: z.preprocess(
      (value) => {
        if (typeof value === "number") return value
        if (typeof value !== "string") return null
        const cleaned = value.replace(/[$,%\s]/g, "")
        return cleaned === "" ? null : cleaned
      },
      z
        .union([
          z.number(),
          z
            .string()
            .regex(/^\d{1,7}(\.\d{0,3})?$/, "Enter an amount like 0.65.")
            .transform(Number),
        ])
        .nullable()
    ),
    notes: optional(max(2000)),
  })
  .superRefine((driver, context) => {
    if (driver.pay_type && driver.pay_rate === null) {
      context.addIssue({
        code: "custom",
        path: ["pay_rate"],
        message: "Enter the rate.",
      })
    }
    if (driver.pay_type === "percent" && (driver.pay_rate ?? 0) > 100) {
      context.addIssue({
        code: "custom",
        path: ["pay_rate"],
        message: "Must be 100% or less.",
      })
    }
  })
  // No pay type means no rate, whatever was left in the box.
  .transform((driver) =>
    driver.pay_type ? driver : { ...driver, pay_rate: null }
  )

export type DriverInput = z.input<typeof driverSchema>
export type DriverValues = z.output<typeof driverSchema>
