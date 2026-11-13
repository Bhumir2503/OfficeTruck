import { z } from "zod"

import { US_STATES } from "@/lib/schemas/organization"

// Keep these rules in step with the checks on public.brokers.

export const INVOICE_METHODS = ["email", "portal"] as const
export type InvoiceMethod = (typeof INVOICE_METHODS)[number]

export const INVOICE_METHOD_LABELS: Record<InvoiceMethod, string> = {
  email: "Email",
  portal: "Their portal (manual upload)",
}

export const CONTACT_ROLES = ["dispatch", "billing", "accounting"] as const
export type ContactRole = (typeof CONTACT_ROLES)[number]

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  dispatch: "Dispatch",
  billing: "Billing",
  accounting: "Accounting",
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

/** "MC-123456", "mc 123456" or "123456" → "123456". */
export function cleanMcNumber(value: string) {
  return value.replace(/^\s*MC[-#\s]*/i, "").trim()
}

const docketNumber = (label: string, clean = (value: string) => value) =>
  optional(
    z.string().regex(/^[0-9]{1,8}$/, `Enter the ${label}, up to 8 digits.`),
    clean
  )

/** Splits "a@x.com, b@y.com" or one per line into a clean, de-duplicated list. */
function list<T extends z.ZodType<string>>(
  item: T,
  limit: number,
  normalize = (value: string) => value.trim().toLowerCase()
) {
  return z.preprocess(
    (value) => {
      const parts = Array.isArray(value)
        ? value
        : typeof value === "string"
          ? value.split(/[\s,;]+/)
          : []
      return [
        ...new Set(
          parts.map((part) => normalize(String(part))).filter(Boolean)
        ),
      ]
    },
    z.array(item).max(limit, `Up to ${limit}.`)
  )
}

/** "@TQL.com" or "https://www.tql.com/" → "tql.com". */
export function cleanDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[^@]*@/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
}

const domain = z
  .string()
  .transform(cleanDomain)
  .pipe(
    z
      .string()
      .regex(
        /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/,
        "Enter domains like tql.com."
      )
  )

export const brokerSchema = z
  .object({
    legal_name: z
      .string()
      .trim()
      .min(1, "Enter the broker's legal name.")
      .max(200, "Must be 200 characters or fewer."),
    dba_name: optional(max(200)),
    mc_number: docketNumber("MC number", cleanMcNumber),
    dot_number: docketNumber("USDOT number", (value) =>
      value.replace(/^\s*(US)?DOT[-#\s]*/i, "")
    ),
    address_line1: optional(max(200)),
    address_line2: optional(max(200)),
    city: optional(max(100)),
    state: optional(
      z.enum(US_STATES, "Use a 2-letter US state code, e.g. TX."),
      (value) => value.toUpperCase()
    ),
    postal_code: optional(
      z.string().regex(/^[0-9]{5}(-[0-9]{4})?$/, "Enter a 5-digit ZIP code.")
    ),
    email_domains: list(domain, 20, (value) => cleanDomain(value)),
    invoice_method: z.enum(INVOICE_METHODS, "Choose how they take invoices."),
    billing_emails: list(z.email("Enter valid email addresses."), 10),
    portal_url: optional(
      z
        .string()
        .max(500, "Must be 500 characters or fewer.")
        .regex(
          /^https?:\/\/\S+$/i,
          "Enter the full address, starting https://."
        )
    ),
    payment_terms_days: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() !== ""
          ? Number(value)
          : (value ?? 30),
      z
        .number("Enter the payment terms in days.")
        .int("Enter whole days.")
        .min(0, "Can't be negative.")
        .max(365, "Must be 365 days or fewer.")
    ),
    quick_pay_fee_percent: z.preprocess((value) => {
      if (typeof value === "number") return value
      if (typeof value !== "string") return null
      const cleaned = value.replace(/[%\s]/g, "")
      return cleaned === "" ? null : Number(cleaned)
    }, z.number("Enter a percentage like 2.5.").min(0, "Can't be negative.").max(100, "Must be 100% or less.").nullable()),
    factored: z.preprocess(
      (value) => value === true || value === "true",
      z.boolean()
    ),
    noa_on_file: z.preprocess(
      (value) => value === true || value === "true",
      z.boolean()
    ),
    notes: optional(max(2000)),
  })
  .superRefine((broker, context) => {
    if (
      broker.invoice_method === "email" &&
      broker.billing_emails.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["billing_emails"],
        message: "Add at least one billing email for emailed invoices.",
      })
    }
  })
  // The notice of assignment only matters when the loads are factored.
  .transform((broker) =>
    broker.factored ? broker : { ...broker, noa_on_file: false }
  )

export type BrokerInput = z.input<typeof brokerSchema>
export type BrokerValues = z.output<typeof brokerSchema>

export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(120, "Must be 120 characters or fewer."),
  role: z.enum(CONTACT_ROLES, "Choose a role."),
  email: optional(z.email("Enter a valid email address."), (value) =>
    value.toLowerCase()
  ),
  phone: optional(
    max(30).regex(/^[0-9+().\-\s]+$/, "Enter a valid phone number.")
  ),
})

export type ContactValues = z.output<typeof contactSchema>

export const doNotUseSchema = z.object({
  do_not_use: z.boolean(),
  do_not_use_reason: optional(max(500)),
})

// Keep these rules in step with the checks on public.factoring_companies.
export const factoringCompanySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter the factoring company's name.")
      .max(200, "Must be 200 characters or fewer."),
    submission_method: z.enum(
      INVOICE_METHODS,
      "Choose how they take invoices."
    ),
    submission_emails: list(z.email("Enter valid email addresses."), 10),
    portal_url: optional(
      z
        .string()
        .max(500, "Must be 500 characters or fewer.")
        .regex(
          /^https?:\/\/\S+$/i,
          "Enter the full address, starting https://."
        )
    ),
    phone: optional(
      max(30).regex(/^[0-9+().\-\s]+$/, "Enter a valid phone number.")
    ),
    remit_line1: optional(max(200)),
    remit_line2: optional(max(200)),
    remit_city: optional(max(100)),
    remit_state: optional(
      z.enum(US_STATES, "Use a 2-letter US state code, e.g. TX."),
      (value) => value.toUpperCase()
    ),
    remit_postal_code: optional(
      z.string().regex(/^[0-9]{5}(-[0-9]{4})?$/, "Enter a 5-digit ZIP code.")
    ),
    notes: optional(max(2000)),
  })
  .superRefine((company, context) => {
    if (
      company.submission_method === "email" &&
      company.submission_emails.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["submission_emails"],
        message: "Add the email address invoice packets go to.",
      })
    }
  })

export type FactoringCompanyInput = z.input<typeof factoringCompanySchema>
export type FactoringCompanyValues = z.output<typeof factoringCompanySchema>
