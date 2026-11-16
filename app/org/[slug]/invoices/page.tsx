import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { InvoicesView } from "@/components/invoices/invoices-view"
import { localToday } from "@/lib/invoice-format"
import { getInvoices, getLoadsToInvoice } from "@/lib/invoices"
import { getOrganization } from "@/lib/organizations"

export const metadata: Metadata = { title: "Invoices" }

export default async function InvoicesPage({
  params,
}: PageProps<"/org/[slug]/invoices">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const [invoices, ready] = await Promise.all([
    getInvoices(organization.id),
    getLoadsToInvoice(organization.id),
  ])

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <InvoicesView
        organizationId={organization.id}
        invoices={invoices}
        ready={ready}
        today={localToday()}
        base={`/org/${organization.slug}/invoices`}
        loadsBase={`/org/${organization.slug}/loads`}
      />
    </div>
  )
}
