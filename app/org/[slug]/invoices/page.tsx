import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { InvoiceNumbering } from "@/components/invoices/invoice-numbering"
import { InvoicesView } from "@/components/invoices/invoices-view"
import { localToday } from "@/lib/invoice-format"
import {
  getInvoices,
  getLoadsToInvoice,
  getNextInvoiceNumber,
} from "@/lib/invoices"
import { canManage, getOrganization } from "@/lib/organizations"

export const metadata: Metadata = { title: "Invoices" }

export default async function InvoicesPage({
  params,
}: PageProps<"/org/[slug]/invoices">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const [invoices, ready, next] = await Promise.all([
    getInvoices(organization.id),
    getLoadsToInvoice(organization.id),
    getNextInvoiceNumber(organization.id),
  ])

  return (
    <div className="flex flex-col gap-6 px-4 py-6 lg:px-6 lg:py-8">
      <InvoicesView
        organizationId={organization.id}
        invoices={invoices}
        ready={ready}
        today={localToday()}
        base={`/org/${organization.slug}/invoices`}
        loadsBase={`/org/${organization.slug}/loads`}
      />
      <InvoiceNumbering
        organizationId={organization.id}
        next={next}
        canManage={canManage(organization)}
      />
    </div>
  )
}
