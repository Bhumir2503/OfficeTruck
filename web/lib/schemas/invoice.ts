import { z } from "zod"

import { money, optional } from "@/lib/schemas/load"

const DATE = /^\d{4}-\d{2}-\d{2}$/

export const invoiceDraftSchema = z.object({
  notes: optional(1000),
  terms_days: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z
      .string()
      .regex(/^\d{1,3}$/, "Enter the days to pay, like 30.")
      .transform(Number)
      .pipe(z.number().max(365, "Terms can be at most 365 days."))
  ),
})
export type InvoiceDraftValues = z.output<typeof invoiceDraftSchema>

/** Email addresses typed one per line or separated by commas. */
export const emailListSchema = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value
          .split(/[\s,;]+/)
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean)
      : value,
  z
    .array(z.email("Check the email addresses."))
    .min(1, "Add at least one email address.")
    .max(10, "Send to at most 10 addresses.")
    .transform((emails) => [...new Set(emails)])
)

/**
 * Today where the person sending is, as "YYYY-MM-DD": the invoice's date.
 * The server's own day is UTC, which is tomorrow on a US evening.
 */
const sentOn = z.string().regex(DATE).optional()

export const emailInvoiceSchema = z.object({
  to: emailListSchema,
  message: optional(2000),
  sent_on: sentOn,
})
export type EmailInvoiceValues = z.output<typeof emailInvoiceSchema>

/** A reminder goes to the same kind of list as the invoice. */
export const reminderSchema = emailInvoiceSchema
export type ReminderValues = z.output<typeof reminderSchema>

export const markSentSchema = z.object({
  via: z.enum(["portal", "other"], "Choose how it was sent."),
  sent_on: sentOn,
})
export type MarkSentValues = z.output<typeof markSentSchema>

/** A draft recorded as sent on an earlier day, from before using the app. */
export const pastInvoiceSchema = z.object({
  via: z.enum(["email", "portal", "other"], "Choose how it was sent."),
  sent_on: z
    .string("Enter the day it was sent.")
    .regex(DATE, "Enter the day it was sent."),
})
export type PastInvoiceValues = z.output<typeof pastInvoiceSchema>

export const paymentSchema = z.object({
  paid_on: z.string().regex(DATE, "Enter the date it was paid."),
  amount: money("Enter the amount paid.").refine(
    (amount) => (amount ?? 0) > 0,
    "Enter an amount over $0."
  ),
  reference: optional(100),
  /** Short-paid, and no more is coming: mark it paid anyway. */
  close_out: z.preprocess(
    (value) => value === "on" || value === true,
    z.boolean()
  ),
})
export type PaymentValues = z.output<typeof paymentSchema>

export const voidInvoiceSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Say why it's being voided.")
    .max(500, "Must be 500 characters or fewer."),
})
export type VoidInvoiceValues = z.output<typeof voidInvoiceSchema>

/** A draft's invoice number, typed over the one it was given. */
export const invoiceNumberSchema = z.object({
  number: z.preprocess(
    (value) =>
      typeof value === "string" ? value.replace(/[,\s#]/g, "") : value,
    z
      .string()
      .regex(/^\d{1,9}$/, "Enter a whole number, like 1001.")
      .transform(Number)
      .pipe(z.number().min(1, "Invoice numbers start at 1."))
  ),
})
export type InvoiceNumberValues = z.output<typeof invoiceNumberSchema>
