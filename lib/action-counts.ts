import { localToday } from "@/lib/invoice-format"
import { getLoadsToInvoice } from "@/lib/invoices"
import { createClient } from "@/lib/supabase/server"

export type ActionCounts = {
  loadsMissingPod: number
  invoicesReadyToSend: number
  overduePayments: number
  documentsExpiringSoon: number
}

/**
 * What needs the owner's attention today, shown on the dashboard and as its sidebar badge.
 * Invoices are counted; missing PODs and expiring documents are still zero
 * until they're wired up.
 */
export async function getActionCounts(
  organizationId: string
): Promise<ActionCounts> {
  const supabase = await createClient()
  const [ready, drafts, overdue] = await Promise.all([
    getLoadsToInvoice(organizationId),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "draft"),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "sent")
      .lt("due_on", localToday()),
  ])

  return {
    loadsMissingPod: 0,
    // Loads with all their paperwork and no invoice yet, plus drafts.
    invoicesReadyToSend:
      ready.filter((load) => load.missing.length === 0).length +
      (drafts.count ?? 0),
    overduePayments: overdue.count ?? 0,
    documentsExpiringSoon: 0,
  }
}

export function totalActions(counts: ActionCounts) {
  return Object.values(counts).reduce((sum, count) => sum + count, 0)
}
