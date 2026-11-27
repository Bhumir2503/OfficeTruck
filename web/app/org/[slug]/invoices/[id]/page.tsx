import type { Metadata } from "next"
import { ArrowLeft, Download, ExternalLink } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { LocalDate } from "@/components/local-date"
import { InvoiceActivity } from "@/components/invoices/invoice-activity"
import { InvoiceNumberField } from "@/components/invoices/invoice-number-field"
import { InvoicePreview } from "@/components/invoices/invoice-preview"
import {
  InvoiceDetails,
  InvoiceSidePanel,
  type PacketItem,
} from "@/components/invoices/invoice-side-panel"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import { InvoiceSummary } from "@/components/invoices/invoice-summary"
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

  const packetHref = `${base}/${invoice.id}/packet`

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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
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
          {/* The packet is what gets sent, filed and asked for again. */}
          <div className="flex shrink-0 gap-2">
            <a
              href={packetHref}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLink />
              View packet
            </a>
            <a
              href={`${packetHref}?download=1`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download />
              Download
            </a>
          </div>
        </div>

        <InvoiceSummary
          invoice={invoice}
          state={state}
          total={page.total}
          dueOn={page.due_on}
          today={today}
        />

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
          {/* The page as it prints, on a desk of its own so it reads as paper. */}
          <div className="min-w-0 rounded-xl border bg-muted/40 p-3 sm:p-6">
            <div className="mx-auto max-w-3xl">
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
                <p className="mt-3 px-1 text-sm text-muted-foreground">
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
          </div>
          {/* What to do next, what goes with it and what's happened so far,
              beside the invoice; on a phone they come right after it. */}
          <aside className="flex flex-col gap-4 xl:sticky xl:top-6 xl:max-h-[calc(100svh-3rem)] xl:overflow-y-auto">
            <InvoiceSidePanel
              organizationId={organization.id}
              invoice={invoice}
              state={state}
              total={page.total}
              dueOn={page.due_on}
              billTo={billTo(load.broker_name, detail.broker, detail.factoring)}
              missing={packet.filter((item) => item.required && !item.files)}
              packetHref={packetHref}
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
            <InvoiceDetails
              organizationId={organization.id}
              invoice={invoice}
              packet={packet}
            />
            <InvoiceActivity invoice={invoice} payments={detail.payments} />
          </aside>
        </div>
      </div>
    </div>
  )
}
