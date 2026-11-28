import { cache } from "react"

import { getFactoringCompany } from "@/lib/factoring"
import type {
  BillingBroker,
  InvoiceLine,
  InvoiceStatus,
  SentVia,
} from "@/lib/invoice-format"
import { missingDocuments, type DocumentKind } from "@/lib/load-document-format"
import { getLoadDocuments } from "@/lib/load-documents"
import { getLoadExpenses } from "@/lib/load-expenses"
import { getLoadDetail } from "@/lib/loads"
import { getOrganizationProfile } from "@/lib/organizations"
import type { LoadStatus } from "@/lib/schemas/load"
import { fetchAll } from "@/lib/supabase/paging"
import { createClient } from "@/lib/supabase/server"

export type Invoice = {
  id: string
  load_id: string
  number: number
  status: InvoiceStatus
  notes: string | null
  terms_days: number
  /** "YYYY-MM-DD", once sent. */
  invoice_date: string | null
  due_on: string | null
  factored: boolean | null
  /** The charges billed, frozen when it was sent. Null on a draft. */
  lines: InvoiceLine[] | null
  total: number | null
  sent_at: string | null
  sent_via: SentVia | null
  sent_to: string[]
  paid_on: string | null
  paid_amount: number | null
  payment_reference: string | null
  voided_at: string | null
  void_reason: string | null
  /** Reminders emailed while it was unpaid. */
  reminder_count: number
  last_reminded_at: string | null
  created_at: string
}

/** One payment on an invoice; a broker may pay in parts. */
export type InvoicePayment = {
  id: string
  /** "YYYY-MM-DD" */
  paid_on: string
  amount: number
  reference: string | null
  created_at: string
}

const INVOICE_COLUMNS =
  "id, load_id, number, status, notes, terms_days, invoice_date, due_on, factored, lines, total, sent_at, sent_via, sent_to, paid_on, paid_amount, payment_reference, voided_at, void_reason, reminder_count, last_reminded_at, created_at"

/** An invoice in the list, with the load it bills and its payments. */
export type InvoiceListItem = Invoice & {
  payments: Pick<InvoicePayment, "paid_on" | "amount">[]
  load: {
    id: string
    reference: string
    broker_name: string
    broker_id: string | null
    rate: number
    status: LoadStatus
    delivery_start: string
    broker: { quick_pay_fee_percent: number | null } | null
  }
}

/** Every invoice in the organization, newest first by invoice date. */
export async function getInvoices(
  organizationId: string
): Promise<InvoiceListItem[]> {
  const supabase = await createClient()
  const data = await fetchAll((from, to) =>
    supabase
      .from("invoices")
      .select(
        `${INVOICE_COLUMNS}, load:loads!invoices_organization_id_load_id_fkey (id, reference, broker_name, broker_id, rate, status, delivery_start, broker:brokers!loads_broker_fkey (quick_pay_fee_percent)), payments:invoice_payments (paid_on, amount)`
      )
      .eq("organization_id", organizationId)
      // By invoice date (drafts, undated, first), so a past invoice recorded
      // late sits with its month, not on top.
      .order("invoice_date", { ascending: false, nullsFirst: true })
      .order("number", { ascending: false })
      .order("id")
      .range(from, to)
  )
  return data as unknown as InvoiceListItem[]
}

/** A broker's invoices, newest number first, with their payments. */
export async function getBrokerInvoices(
  organizationId: string,
  brokerId: string
): Promise<InvoiceListItem[]> {
  const supabase = await createClient()
  const data = await fetchAll((from, to) =>
    supabase
      .from("invoices")
      .select(
        `${INVOICE_COLUMNS}, load:loads!invoices_organization_id_load_id_fkey!inner (id, reference, broker_name, broker_id, rate, status, delivery_start, broker:brokers!loads_broker_fkey (quick_pay_fee_percent)), payments:invoice_payments (paid_on, amount)`
      )
      .eq("organization_id", organizationId)
      .eq("load.broker_id", brokerId)
      .order("invoice_date", { ascending: false, nullsFirst: true })
      .order("number", { ascending: false })
      .order("id")
      .range(from, to)
  )
  return data as unknown as InvoiceListItem[]
}

/** A delivered or TONU load with no invoice yet. */
export type ReadyLoad = {
  id: string
  reference: string
  broker_name: string
  rate: number
  status: LoadStatus
  delivery_start: string
  /** The day it was really delivered; null for TONU. */
  delivered_on: string | null
  /** Required documents still missing, in checklist order. */
  missing: DocumentKind[]
}

/**
 * Drafts and sent invoices only, for the To do and the dashboard's money
 * owed: paid and void ones never need action, and they're most of them.
 */
export async function getOpenInvoices(
  organizationId: string
): Promise<InvoiceListItem[]> {
  const supabase = await createClient()
  const data = await fetchAll((from, to) =>
    supabase
      .from("invoices")
      .select(
        `${INVOICE_COLUMNS}, load:loads!invoices_organization_id_load_id_fkey (id, reference, broker_name, broker_id, rate, status, delivery_start, broker:brokers!loads_broker_fkey (quick_pay_fee_percent)), payments:invoice_payments (paid_on, amount)`
      )
      .eq("organization_id", organizationId)
      .in("status", ["draft", "sent"])
      .order("number", { ascending: false })
      .order("id")
      .range(from, to)
  )
  return data as unknown as InvoiceListItem[]
}

/** Loads that are done and waiting to be billed, oldest delivery first. */
export async function getLoadsToInvoice(
  organizationId: string
): Promise<ReadyLoad[]> {
  const supabase = await createClient()
  // One request, with each load's invoices and paperwork embedded: this
  // runs on every page (the sidebar badge), and each separate lookup was
  // another round trip to wait for.
  const loads = (await fetchAll((from, to) =>
    supabase
      .from("loads")
      .select(
        "id, reference, broker_name, rate, status, delivery_start, delivered_on, invoices!invoices_organization_id_load_id_fkey (status), load_documents (kind), load_charges (kind), load_expenses (kind, receipt_path)"
      )
      .eq("organization_id", organizationId)
      .in("status", ["delivered", "tonu"])
      .order("delivery_start")
      .order("id")
      .range(from, to)
  )) as unknown as (Omit<ReadyLoad, "missing"> & {
    invoices: { status: string }[]
    load_documents: { kind: DocumentKind }[]
    load_charges: { kind: string }[]
    load_expenses: { kind: string; receipt_path: string | null }[]
  })[]

  return loads
    .filter((load) => !load.invoices.some((i) => i.status !== "void"))
    .map(
      ({ invoices, load_documents, load_charges, load_expenses, ...load }) => {
        void invoices
        const docs: { kind: DocumentKind }[] = [...load_documents]
        // A lumper receipt on an expense counts as the lumper receipt.
        if (load_expenses.some((e) => e.kind === "lumper" && e.receipt_path)) {
          docs.push({ kind: "lumper_receipt" })
        }
        return {
          ...load,
          // A TONU load never ran, so there's no BOL or POD to wait for.
          missing:
            load.status === "tonu"
              ? []
              : missingDocuments(
                  load_charges as Parameters<typeof missingDocuments>[0],
                  docs
                ),
        }
      }
    )
}

export type LoadInvoice = Pick<Invoice, "id" | "number" | "status" | "due_on">

/** Every load's live (not void) invoice, by load id. */
export async function getLoadInvoices(
  organizationId: string
): Promise<Record<string, LoadInvoice>> {
  const supabase = await createClient()
  const data = await fetchAll((from, to) =>
    supabase
      .from("invoices")
      .select("id, load_id, number, status, due_on")
      .eq("organization_id", organizationId)
      .neq("status", "void")
      .order("id")
      .range(from, to)
  )
  return Object.fromEntries(
    data.map(({ load_id, ...invoice }) => [load_id, invoice as LoadInvoice])
  )
}

/** The live (not void) invoice on a load, if there is one. */
export async function getLoadInvoice(
  organizationId: string,
  loadId: string
): Promise<LoadInvoice | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("invoices")
    .select("id, number, status, due_on")
    .eq("organization_id", organizationId)
    .eq("load_id", loadId)
    .neq("status", "void")
    .maybeSingle()
  if (error) {
    throw error
  }
  return data as LoadInvoice | null
}

/** The broker's billing details, for where the invoice goes. */
export type InvoiceBroker = BillingBroker & {
  id: string
  dba_name: string | null
  mc_number: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  noa_on_file: boolean
  quick_pay_fee_percent: number | null
}

/** Everything an invoice page, the PDF and the email need. */
export const getInvoiceDetail = cache(async function getInvoiceDetail(
  organizationId: string,
  id: string
) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle()
  if (error) {
    // An id that isn't a UUID is just an invoice that doesn't exist.
    if (error.code === "22P02") return null
    throw error
  }
  if (!data) {
    return null
  }
  const invoice = data as unknown as Invoice

  const [
    detail,
    documents,
    expenses,
    company,
    factoring,
    voided,
    payments,
    branding,
  ] = await Promise.all([
    getLoadDetail(organizationId, invoice.load_id),
    getLoadDocuments(organizationId, invoice.load_id),
    getLoadExpenses(organizationId, invoice.load_id),
    getOrganizationProfile(organizationId),
    getFactoringCompany(organizationId),
    // Earlier invoices for this load that were voided, for the history.
    supabase
      .from("invoices")
      .select("id, number, voided_at, void_reason")
      .eq("organization_id", organizationId)
      .eq("load_id", invoice.load_id)
      .eq("status", "void")
      .neq("id", id)
      .order("number"),
    supabase
      .from("invoice_payments")
      .select("id, paid_on, amount, reference, created_at")
      .eq("organization_id", organizationId)
      .eq("invoice_id", id)
      .order("paid_on")
      .order("created_at"),
    supabase
      .from("organizations")
      .select("icon_url")
      .eq("id", organizationId)
      .single(),
  ])
  if (payments.error) {
    throw payments.error
  }
  if (!detail) {
    return null
  }

  let broker: InvoiceBroker | null = null
  if (detail.load.broker_id) {
    const { data: row, error: brokerError } = await supabase
      .from("brokers")
      .select(
        "id, legal_name, dba_name, mc_number, address_line1, address_line2, city, state, postal_code, invoice_method, billing_emails, portal_url, factored, noa_on_file, quick_pay_fee_percent"
      )
      .eq("organization_id", organizationId)
      .eq("id", detail.load.broker_id)
      .maybeSingle()
    if (brokerError) throw brokerError
    broker = row as InvoiceBroker | null
  }

  return {
    invoice,
    ...detail,
    documents,
    expenses,
    broker,
    company,
    iconUrl: (branding.data?.icon_url as string | null) ?? null,
    factoring,
    payments: payments.data as InvoicePayment[],
    voided: (voided.data ?? []) as {
      id: string
      number: number
      voided_at: string
      void_reason: string | null
    }[],
  }
})

export type InvoiceDetail = NonNullable<
  Awaited<ReturnType<typeof getInvoiceDetail>>
>

/**
 * The lines an invoice bills: frozen once sent, the load's charges as they
 * are now while it's a draft.
 */
export function invoiceLines(detail: InvoiceDetail): InvoiceLine[] {
  return (
    detail.invoice.lines ??
    detail.charges.map((charge) => ({
      kind: charge.kind,
      description: charge.description,
      amount: Number(charge.amount),
    }))
  )
}

/** The paths of the files that go in the packet, in packet order. */
export async function packetFiles(organizationId: string, loadId: string) {
  const supabase = await createClient()
  const [documents, receipts] = await Promise.all([
    supabase
      .from("load_documents")
      .select("kind, path, file_name, content_type")
      .eq("organization_id", organizationId)
      .eq("load_id", loadId)
      .neq("kind", "other")
      .order("created_at"),
    supabase
      .from("load_expenses")
      .select("receipt_path, receipt_name, receipt_type")
      .eq("organization_id", organizationId)
      .eq("load_id", loadId)
      .eq("kind", "lumper")
      .not("receipt_path", "is", null)
      .order("created_at"),
  ])
  if (documents.error) throw documents.error
  if (receipts.error) throw receipts.error

  const order: DocumentKind[] = ["rate_con", "bol", "pod", "lumper_receipt"]
  const files = [
    ...(documents.data as {
      kind: DocumentKind
      path: string
      file_name: string
      content_type: string
    }[]),
    ...receipts.data.map((receipt) => ({
      kind: "lumper_receipt" as const,
      path: receipt.receipt_path as string,
      file_name: receipt.receipt_name as string,
      content_type: receipt.receipt_type as string,
    })),
  ]
  return files.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
}
