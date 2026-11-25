import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { LocalDate } from "@/components/local-date"
import { InvoiceNumberField } from "@/components/invoices/invoice-number-field"
import { InvoicePreview } from "@/components/invoices/invoice-preview"
import {
  InvoiceDetails,
  InvoiceSidePanel,
  type PacketItem,
} from "@/components/invoices/invoice-side-panel"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import { buttonVariants } from "@/components/ui/button"
import { billTo, invoiceState, localToday } from "@/lib/invoice-format"
import { invoicePageData } from "@/lib/invoice-packet"
import { getInvoiceDetail } from "@/lib/invoices"
import {
  DOCUMENT_LABELS,
  requiredDocuments,
  type DocumentKind,
} from "@/lib/load-document-format"
import { getOrganization } from "@/lib/organizations"

async function invoiceFor(
  params: PageProps<"/org/[slug]/invoices/[id]">["params"]
) {
  const { slug, id } = await params
  const organization = await getOrganization(slug)
  const detail = organization
    ? await getInvoiceDetail(organization.id, id)
    : null
  return { organization, detail }
}

export async function generateMetadata({
  params,
}: PageProps<"/org/[slug]/invoices/[id]">): Promise<Metadata> {
  const { detail } = await invoiceFor(params)
  return {
    title: detail ? `Invoice ${detail.invoice.number}` : "Invoice not found",
  }
}

export default async function InvoicePage({
  params,
}: PageProps<"/org/[slug]/invoices/[id]">) {
  const { organization, detail } = await invoiceFor(params)
  if (!organization || !detail) {
    notFound()
  }
  const { invoice, load, charges, documents, expenses } = detail
  const today = localToday()
  const page = invoicePageData(detail, today)
  const state = invoiceState(invoice, today)
  const base = `/org/${organization.slug}/invoices`
  const loadHref = `/org/${organization.slug}/loads/${load.id}`

  // What goes behind the invoice, in packet order.
  const required = requiredDocuments(charges)
  const lumperReceipts = expenses.filter(
    (expense) => expense.kind === "lumper" && expense.receipt_url
  ).length
  const kinds: DocumentKind[] = ["rate_con", "bol", "pod", "lumper_receipt"]
  const packet: PacketItem[] = kinds
    .map((kind) => ({
      label: DOCUMENT_LABELS[kind],
      files:
        documents.filter((document) => document.kind === kind).length +
        (kind === "lumper_receipt" ? lumperReceipts : 0),
      // A TONU load never ran, so it has no BOL or POD.
      required:
        load.status === "tonu" ? kind === "rate_con" : required.includes(kind),
    }))
    .filter((item) => item.required || item.files > 0)

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Link
          href={base}
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-ml-2 w-fit",
          })}
        >
          <ArrowLeft />
          All invoices
        </Link>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">
              Invoice {invoice.number}
            </h2>
            <InvoiceStatusBadge state={state} />
          </div>
          <p className="text-sm text-muted-foreground">
            For load{" "}
            <Link href={loadHref} className="font-medium hover:underline">
              {load.reference}
            </Link>{" "}
            · {load.broker_name}
            {detail.voided.length > 0 && (
              <>
                {` · Replaces ${detail.voided
                  .map((voided) => `#${voided.number}`)
                  .join(", ")}, voided `}
                <LocalDate value={detail.voided.at(-1)!.voided_at} />
              </>
            )}
          </p>
        </div>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0">
            <InvoicePreview
              page={page}
              numberField={
                invoice.status === "draft" ? (
                  <InvoiceNumberField
                    organizationId={organization.id}
                    invoiceId={invoice.id}
                    number={invoice.number}
                  />
                ) : undefined
              }
            />
            {invoice.status === "draft" && (
              <p className="mt-3 text-sm text-muted-foreground">
                The lines are the load&apos;s charges as they are now. Change
                them on the{" "}
                <Link href={loadHref} className="underline">
                  load
                </Link>
                ; they&apos;re locked in when the invoice is sent. Click the
                invoice number to change it.
              </p>
            )}
          </div>
          {/* Only sending (or the payment) sits beside the invoice; on a
              phone it comes right after it. */}
          <aside className="xl:sticky xl:top-6 xl:row-span-2 xl:max-h-[calc(100svh-3rem)] xl:overflow-y-auto">
            <InvoiceSidePanel
              organizationId={organization.id}
              invoice={invoice}
              state={state}
              total={page.total}
              dueOn={page.due_on}
              billTo={billTo(load.broker_name, detail.broker, detail.factoring)}
              missing={packet.filter((item) => item.required && !item.files)}
              packetHref={`${base}/${invoice.id}/packet`}
              invoicesBase={base}
              payments={detail.payments}
              noaMissing={
                !!detail.broker?.factored && !detail.broker.noa_on_file
              }
              brokerName={detail.broker?.legal_name ?? load.broker_name}
              quickPayPercent={
                detail.broker?.quick_pay_fee_percent != null
                  ? Number(detail.broker.quick_pay_fee_percent)
                  : null
              }
              today={today}
            />
          </aside>
          <div className="min-w-0">
            <InvoiceDetails
              organizationId={organization.id}
              invoice={invoice}
              packet={packet}
              packetHref={`${base}/${invoice.id}/packet`}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
