import {
  COMPANY_DOCUMENT_LABELS,
  type CompanyDocumentKind,
  type DocumentEntry,
} from "@/lib/company-document-format"
import {
  DRIVER_DOCUMENT_LABELS,
  type DriverDocumentKind,
} from "@/lib/driver-document-format"
import { DOCUMENT_LABELS, type DocumentKind } from "@/lib/load-document-format"
import { EXPENSE_LABELS, type ExpenseKind } from "@/lib/load-expense-format"
import {
  TRUCK_DOCUMENT_LABELS,
  type TruckDocumentKind,
} from "@/lib/truck-document-format"
import { fetchAll } from "@/lib/supabase/paging"
import { createClient } from "@/lib/supabase/server"

export type CompanyDocument = {
  id: string
  kind: CompanyDocumentKind
  title: string | null
  expires_on: string | null
  file_name: string
  created_at: string
  url: string | null
}

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Short-lived links for files in a private bucket, by path. */
async function sign(supabase: Supabase, bucket: string, paths: string[]) {
  const urls = new Map<string, string>()
  if (!paths.length) return urls
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, 60 * 60)
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl)
  }
  return urls
}

/** The company's own papers, soonest to expire first. */
export async function getCompanyDocuments(
  organizationId: string
): Promise<CompanyDocument[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("company_documents")
    .select("id, kind, title, expires_on, path, file_name, created_at")
    .eq("organization_id", organizationId)
    .order("expires_on", { nullsFirst: false })
    .order("created_at", { ascending: false })
  if (error) throw error
  const urls = await sign(
    supabase,
    "load-documents",
    data.map((row) => row.path)
  )
  return data.map(({ path, ...row }) => ({
    ...row,
    kind: row.kind as CompanyDocumentKind,
    url: urls.get(path) ?? null,
  }))
}

/**
 * Every file in the organization: company papers, load documents, expense
 * receipts, driver documents and truck documents, newest first.
 */
export async function getAllDocuments(
  organizationId: string,
  company: CompanyDocument[]
): Promise<DocumentEntry[]> {
  const supabase = await createClient()
  const [loadRows, receiptData, driverData, truckData] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("load_documents")
        .select(
          "id, kind, path, file_name, created_at, load:loads (id, reference)"
        )
        .eq("organization_id", organizationId)
        .order("id")
        .range(from, to)
    ),
    fetchAll((from, to) =>
      supabase
        .from("load_expenses")
        .select(
          "id, kind, receipt_path, receipt_name, spent_on, load:loads (id, reference)"
        )
        .eq("organization_id", organizationId)
        .not("receipt_path", "is", null)
        .order("id")
        .range(from, to)
    ),
    fetchAll((from, to) =>
      supabase
        .from("driver_documents")
        .select(
          "id, kind, title, path, file_name, created_at, driver:drivers (id, full_name)"
        )
        .eq("organization_id", organizationId)
        .order("id")
        .range(from, to)
    ),
    fetchAll((from, to) =>
      supabase
        .from("truck_documents")
        .select(
          "id, kind, title, path, file_name, created_at, truck:trucks (id, unit_number)"
        )
        .eq("organization_id", organizationId)
        .order("id")
        .range(from, to)
    ),
  ])

  const loadDocs = { data: loadRows }
  const receipts = { data: receiptData }
  const drivers = { data: driverData }
  const trucks = { data: truckData }

  type Linked = { id: string; reference: string } | null
  const docs = loadDocs.data as unknown as {
    id: string
    kind: DocumentKind
    path: string
    file_name: string
    created_at: string
    load: Linked
  }[]
  const receiptRows = receipts.data as unknown as {
    id: string
    kind: ExpenseKind
    receipt_path: string
    receipt_name: string | null
    spent_on: string
    load: Linked
  }[]
  const driverRows = drivers.data as unknown as {
    id: string
    kind: DriverDocumentKind
    title: string | null
    path: string
    file_name: string
    created_at: string
    driver: { id: string; full_name: string } | null
  }[]
  const truckRows = trucks.data as unknown as {
    id: string
    kind: TruckDocumentKind
    title: string | null
    path: string
    file_name: string
    created_at: string
    truck: { id: string; unit_number: string } | null
  }[]

  const [loadUrls, driverUrls, truckUrls] = await Promise.all([
    sign(supabase, "load-documents", [
      ...docs.map((doc) => doc.path),
      ...receiptRows.map((row) => row.receipt_path),
    ]),
    sign(
      supabase,
      "driver-documents",
      driverRows.map((row) => row.path)
    ),
    sign(
      supabase,
      "truck-documents",
      truckRows.map((row) => row.path)
    ),
  ])

  const entries: DocumentEntry[] = [
    ...company.map((doc) => ({
      key: `company:${doc.id}`,
      group: "company" as const,
      type: doc.title ?? COMPANY_DOCUMENT_LABELS[doc.kind],
      file_name: doc.file_name,
      owner: "Company",
      path: null,
      date: doc.created_at,
      url: doc.url,
    })),
    ...docs.map((doc) => ({
      key: `load:${doc.id}`,
      group: "load" as const,
      type: DOCUMENT_LABELS[doc.kind],
      file_name: doc.file_name,
      owner: doc.load?.reference ?? "Load",
      path: doc.load ? `loads/${doc.load.id}` : null,
      date: doc.created_at,
      url: loadUrls.get(doc.path) ?? null,
    })),
    ...receiptRows.map((row) => ({
      key: `receipt:${row.id}`,
      group: "receipt" as const,
      type: `${EXPENSE_LABELS[row.kind]} receipt`,
      file_name: row.receipt_name ?? "Receipt",
      owner: row.load?.reference ?? "Load",
      path: row.load ? `loads/${row.load.id}` : null,
      date: row.spent_on,
      url: loadUrls.get(row.receipt_path) ?? null,
    })),
    ...driverRows.map((row) => ({
      key: `driver:${row.id}`,
      group: "driver" as const,
      type: row.title ?? DRIVER_DOCUMENT_LABELS[row.kind],
      file_name: row.file_name,
      owner: row.driver?.full_name ?? "Driver",
      path: row.driver ? `drivers/${row.driver.id}` : null,
      date: row.created_at,
      url: driverUrls.get(row.path) ?? null,
    })),
    ...truckRows.map((row) => ({
      key: `truck:${row.id}`,
      group: "truck" as const,
      type: row.title ?? TRUCK_DOCUMENT_LABELS[row.kind],
      file_name: row.file_name,
      owner: row.truck?.unit_number ?? "Truck",
      path: row.truck ? `equipment/${row.truck.id}` : null,
      date: row.created_at,
      url: truckUrls.get(row.path) ?? null,
    })),
  ]
  return entries.sort((a, b) => b.date.localeCompare(a.date))
}
