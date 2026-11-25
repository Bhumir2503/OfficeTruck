import { z } from "zod"

// Keep these rules in step with the checks on public.organizations.
export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter an organization name.")
    .max(100, "Must be 100 characters or fewer."),
  slug: z
    .string()
    .trim()
    .min(2, "Must be at least 2 characters long.")
    .max(40, "Must be 40 characters or fewer.")
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers and single hyphens."
    ),
})

/** Turns an organization name into a URL slug, e.g. "Acme Freight, LLC" → "acme-freight-llc". */
export function slugify(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "")
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

// US states, DC and territories. Matches the checks in the settings and
// drivers migrations.
export const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "AS",
  "GU",
  "MP",
  "PR",
  "VI",
] as const

// Keep these rules in step with the checks added in the settings migration.
export const organizationProfileSchema = z.object({
  name: createOrganizationSchema.shape.name,
  legal_name: optional(z.string().max(200, "Must be 200 characters or fewer.")),
  dot_number: optional(
    z.string().regex(/^[0-9]{1,8}$/, "Enter up to 8 digits."),
    (value) => value.replace(/^(US)?DOT[-#\s]*/i, "")
  ),
  mc_number: optional(
    z.string().regex(/^[0-9]{1,8}$/, "Enter up to 8 digits."),
    (value) => value.replace(/^MC[-#\s]*/i, "")
  ),
  phone: optional(
    z
      .string()
      .max(30, "Must be 30 characters or fewer.")
      .regex(/^[0-9+().\-\s]+$/, "Enter a valid phone number.")
  ),
  email: optional(z.email("Enter a valid email address.")),
  address_line1: optional(
    z.string().max(200, "Must be 200 characters or fewer.")
  ),
  address_line2: optional(
    z.string().max(200, "Must be 200 characters or fewer.")
  ),
  city: optional(z.string().max(100, "Must be 100 characters or fewer.")),
  state: optional(
    z.enum(US_STATES, "Use a 2-letter US state code, e.g. TX."),
    (value) => value.toUpperCase()
  ),
  postal_code: optional(
    z.string().regex(/^[0-9]{5}(-[0-9]{4})?$/, "Enter a 5-digit ZIP code.")
  ),
})
