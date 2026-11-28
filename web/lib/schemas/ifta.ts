import { z } from "zod"

import { IFTA_JURISDICTIONS } from "@/lib/ifta-format"

// Keep these rules in step with the checks in the IFTA migration.

const day = (message: string) =>
  z.string(message).regex(/^\d{4}-\d{2}-\d{2}$/, message)

const jurisdiction = z.enum(IFTA_JURISDICTIONS, "Choose a state or province.")

/** Strips "$", commas and spaces from a typed number. */
const cleaned = (value: unknown) =>
  typeof value === "number"
    ? String(value)
    : typeof value === "string"
      ? value.replace(/[$,\s]/g, "")
      : value

export const quarterSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
})

/** One truck's miles in one state for a quarter. */
export const stateMilesSchema = quarterSchema.extend({
  truck_id: z.uuid("Choose a truck."),
  jurisdiction,
  miles: z.preprocess(
    cleaned,
    z
      .string("Enter the miles.")
      .regex(/^\d+$/, "Enter whole miles, like 1,240.")
      .transform(Number)
      .refine(
        (n) => n >= 1 && n <= 1_000_000,
        "Enter between 1 and 1,000,000 miles."
      )
  ),
})

export type StateMilesValues = z.output<typeof stateMilesSchema>

/** One fuel purchase. */
export const fuelPurchaseSchema = z.object({
  truck_id: z.uuid("Choose a truck."),
  purchased_on: day("Enter the date of the purchase."),
  jurisdiction,
  gallons: z.preprocess(
    cleaned,
    z
      .string("Enter the gallons.")
      .regex(/^\d{1,5}(\.\d{0,3})?$/, "Enter gallons like 112.5.")
      .transform(Number)
      .refine(
        (n) => n > 0 && n <= 10_000,
        "Enter between 0 and 10,000 gallons."
      )
  ),
  amount: z.preprocess(
    (value) => {
      const text = cleaned(value)
      return text === "" || text === undefined ? null : text
    },
    z
      .string()
      .regex(/^\d{1,8}(\.\d{0,2})?$/, "Enter an amount like 512.40.")
      .transform(Number)
      .nullable()
  ),
  vendor: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== "" ? value.trim() : null,
    z.string().max(120, "Must be 120 characters or fewer.").nullable()
  ),
})

export type FuelPurchaseValues = z.output<typeof fuelPurchaseSchema>

export const filedSchema = quarterSchema.extend({
  filed_on: day("Enter the date it was filed."),
})
