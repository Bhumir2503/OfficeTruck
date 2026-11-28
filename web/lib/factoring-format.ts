import type { InvoiceMethod } from "@/lib/schemas/broker"
import { possessive } from "@/lib/text-format"

// Shared by server and client: no server-only imports here.

export type FactoringCompany = {
  name: string
  submission_method: InvoiceMethod
  submission_emails: string[]
  portal_url: string | null
  phone: string | null
  remit_line1: string | null
  remit_line2: string | null
  remit_city: string | null
  remit_state: string | null
  remit_postal_code: string | null
  notes: string | null
}

/** "emailed to invoices@rts.com", or "uploaded to RTS's portal". */
export function describeSubmission(company: FactoringCompany) {
  if (company.submission_method === "portal") {
    return `uploaded to ${possessive(company.name)} portal`
  }
  return company.submission_emails[0]
    ? `emailed to ${company.submission_emails[0]}`
    : `sent to ${company.name}`
}
