import { z } from "zod"

import { IFTA_JURISDICTIONS } from "@/lib/ifta-format"

// Keep these rules in step with the checks on public.load_expenses.

export const EXPENSE_KINDS = [
  "fuel",
  "tolls",
  "scale",
  "parking",
  "lumper",
  "repair",
  "other",
] as const
export type ExpenseKind = (typeof EXPENSE_KINDS)[number]

export const EXPENSE_LABELS: Record<ExpenseKind, string> = {
  fuel: "Fuel",
  tolls: "Tolls",
  scale: "Scale",
  parking: "Parking",
  lumper: "Lumper",
  repair: "Repair",
  other: "Other",
}

export const PAID_BY = ["company", "driver"] as const
export type PaidBy = (typeof PAID_BY)[number]

export const PAID_BY_LABELS: Record<PaidBy, string> = {
  company: "Company",
  driver: "Driver, out of pocket",
}

/** A receipt file already uploaded to the load's folder. */
export type ExpenseReceipt = { path: string; name: string; type: string }

export const expenseSchema = z
  .object({
    kind: z.enum(EXPENSE_KINDS, "Choose what it was for."),
    // Typed with or without "$" and commas, or a number when re-checked.
    amount: z
      .preprocess(
        (value) =>
          typeof value === "number"
            ? value.toFixed(2)
            : typeof value === "string"
              ? value.replace(/[$,\s]/g, "")
              : value,
        z
          .string("Enter the amount.")
          .min(1, { message: "Enter the amount.", abort: true })
          .regex(/^\d{1,8}(\.\d{0,2})?$/, "Enter an amount like 412.50.")
      )
      .transform(Number)
      .refine((value) => value > 0, "Must be more than $0."),
    spent_on: z
      .string("Enter the date.")
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date."),
    paid_by: z.enum(PAID_BY, "Choose who paid."),
    note: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() !== "" ? value.trim() : null,
      z.string().max(200, "Must be 200 characters or fewer.").nullable()
    ),
    // For IFTA: on fuel only, both or neither. Blank when not given.
    gallons: z.preprocess(
      (value) => {
        if (typeof value === "number") return String(value)
        if (typeof value !== "string") return null
        const cleaned = value.replace(/[,\s]/g, "")
        return cleaned === "" ? null : cleaned
      },
      z
        .string()
        .regex(/^\d{1,5}(\.\d{0,3})?$/, "Enter gallons like 112.5.")
        .transform(Number)
        .refine(
          (n) => n > 0 && n <= 10_000,
          "Enter between 0 and 10,000 gallons."
        )
        .nullable()
    ),
    jurisdiction: z.preprocess(
      (value) => (typeof value === "string" && value !== "" ? value : null),
      z.enum(IFTA_JURISDICTIONS, "Choose a state or province.").nullable()
    ),
  })
  .superRefine((values, context) => {
    if (values.kind !== "fuel") {
      if (values.gallons !== null || values.jurisdiction !== null) {
        context.addIssue({
          code: "custom",
          path: ["gallons"],
          message: "Gallons and state are only for fuel.",
        })
      }
      return
    }
    if (values.gallons !== null && values.jurisdiction === null) {
      context.addIssue({
        code: "custom",
        path: ["jurisdiction"],
        message: "Choose the state it was bought in, for IFTA.",
      })
    }
    if (values.jurisdiction !== null && values.gallons === null) {
      context.addIssue({
        code: "custom",
        path: ["gallons"],
        message: "Enter the gallons too, for IFTA.",
      })
    }
  })

export type ExpenseValues = z.output<typeof expenseSchema>

/** Totals for a load's expenses: all of them, and what's owed to the driver. */
export function expenseTotals(expenses: { amount: number; paid_by: PaidBy }[]) {
  let total = 0
  let owedToDriver = 0
  for (const expense of expenses) {
    total += Number(expense.amount)
    if (expense.paid_by === "driver") owedToDriver += Number(expense.amount)
  }
  return { total, owedToDriver }
}
