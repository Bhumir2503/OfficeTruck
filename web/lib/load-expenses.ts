import type { ExpenseKind, PaidBy } from "@/lib/load-expense-format"
import { createClient } from "@/lib/supabase/server"

export type LoadExpense = {
  id: string
  kind: ExpenseKind
  amount: number
  /** A calendar date, "YYYY-MM-DD". */
  spent_on: string
  paid_by: PaidBy
  note: string | null
  receipt_name: string | null
  receipt_type: string | null
  /** A link to the receipt that works for an hour, or null. */
  receipt_url: string | null
}

/** A load's expenses, oldest first, each with a short-lived receipt link. */
export async function getLoadExpenses(
  organizationId: string,
  loadId: string
): Promise<LoadExpense[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("load_expenses")
    .select(
      "id, kind, amount, spent_on, paid_by, note, receipt_path, receipt_name, receipt_type"
    )
    .eq("organization_id", organizationId)
    .eq("load_id", loadId)
    .order("spent_on")
    .order("created_at")
  if (error) {
    throw error
  }
  const rows = data as (Omit<LoadExpense, "receipt_url"> & {
    receipt_path: string | null
  })[]
  const paths = rows
    .map((row) => row.receipt_path)
    .filter((path): path is string => !!path)
  const urls = new Map<string, string>()
  if (paths.length) {
    const { data: signed } = await supabase.storage
      .from("load-documents")
      .createSignedUrls(paths, 60 * 60)
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) {
        urls.set(item.path, item.signedUrl)
      }
    }
  }
  return rows.map(({ receipt_path, ...row }) => ({
    ...row,
    amount: Number(row.amount),
    receipt_url: receipt_path ? (urls.get(receipt_path) ?? null) : null,
  }))
}
