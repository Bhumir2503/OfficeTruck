import { z } from "zod"

import { truckSchema } from "@/lib/schemas/truck"

// Keep these rules in step with the checks on public.trailers. Fields shared
// with trucks (VIN, plate, dates and so on) use the truck rules as they are.

export const TRAILER_TYPES = [
  "dry_van",
  "reefer",
  "flatbed",
  "step_deck",
  "tanker",
  "other",
] as const
export type TrailerType = (typeof TRAILER_TYPES)[number]

export const TRAILER_TYPE_LABELS: Record<TrailerType, string> = {
  dry_van: "Dry van",
  reefer: "Reefer",
  flatbed: "Flatbed",
  step_deck: "Step deck",
  tanker: "Tanker",
  other: "Other",
}

const shared = truckSchema.shape

export const trailerSchema = z.object({
  unit_number: shared.unit_number,
  trailer_type: z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.enum(TRAILER_TYPES, "Choose a trailer type.").nullable()
  ),
  length_ft: z.preprocess(
    (value) => {
      if (typeof value === "number") return String(value)
      return typeof value === "string" && value.trim() !== ""
        ? value.trim()
        : null
    },
    z
      .string()
      .regex(/^\d{2}$/, "Enter the length in feet, e.g. 53.")
      .transform(Number)
      .refine((feet) => feet >= 10 && feet <= 60, "Enter 10 to 60 feet.")
      .nullable()
  ),
  vin: shared.vin,
  year: shared.year,
  make: shared.make,
  plate_number: shared.plate_number,
  plate_state: shared.plate_state,
  ownership: shared.ownership,
  truck_id: z.preprocess(
    (value) => (typeof value === "string" && value !== "" ? value : null),
    z.uuid("Choose a truck.").nullable()
  ),
  annual_inspection_on: shared.annual_inspection_on,
  registration_expires_on: shared.registration_expires_on,
  plate_expires_on: shared.plate_expires_on,
  notes: shared.notes,
})

export type TrailerInput = z.input<typeof trailerSchema>
export type TrailerValues = z.output<typeof trailerSchema>
