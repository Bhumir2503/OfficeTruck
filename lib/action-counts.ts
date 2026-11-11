export type ActionCounts = {
  loadsMissingPod: number
  invoicesReadyToSend: number
  overduePayments: number
  documentsExpiringSoon: number
}

/**
 * What needs the owner's attention today, shown on the dashboard and as its sidebar badge.
 * Loads, invoices and documents aren't stored yet, so everything is zero until
 * those tables exist; then count them here for the current organization.
 */
export async function getActionCounts(): Promise<ActionCounts> {
  return {
    loadsMissingPod: 0,
    invoicesReadyToSend: 0,
    overduePayments: 0,
    documentsExpiringSoon: 0,
  }
}

export function totalActions(counts: ActionCounts) {
  return Object.values(counts).reduce((sum, count) => sum + count, 0)
}
