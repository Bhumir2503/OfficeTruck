import {
  COMPANY_DOCUMENT_LABELS,
  type CompanyDocumentKind,
  type DocumentEntry,
} from "@/lib/company-document-format"
import { DOCUMENT_LABELS, type DocumentKind } from "@/lib/load-document-format"
import { EXPENSE_LABELS, type ExpenseKind } from "@/lib/load-expense-format"
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
 * receipts and driver CDL and medical card photos, newest first.
 */
export async function getAllDocuments(
  organizationId: string,
  company: CompanyDocument[]
): Promise<DocumentEntry[]> {
  const supabase = await createClient()
  const [loadDocs, receipts, drivers] = await Promise.all([
    supabase
      .from("load_documents")
      .select(
        "id, kind, path, file_name, created_at, load:loads (id, reference)"
      )
      .eq("organization_id", organizationId),
    supabase
      .from("load_expenses")
      .select(
        "id, kind, receipt_path, receipt_name, spent_on, load:loads (id, reference)"
      )
      .eq("organization_id", organizationId)
      .not("receipt_path", "is", null),
    supabase
      .from("drivers")
      .select(
        "id, full_name, cdl_photo_path, medical_card_photo_path, updated_at"
      )
      .eq("organization_id", organizationId),
  ])
  for (const result of [loadDocs, receipts, drivers]) {
    if (result.error) throw result.error
  }

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
  const driverRows = drivers.data as {
    id: string
    full_name: string
    cdl_photo_path: string | null
    medical_card_photo_path: string | null
    updated_at: string
  }[]

  const [loadUrls, driverUrls] = await Promise.all([
    sign(supabase, "load-documents", [
      ...docs.map((doc) => doc.path),
      ...receiptRows.map((row) => row.receipt_path),
    ]),
    sign(
      supabase,
      "driver-documents",
      driverRows.flatMap((driver) =>
        [driver.cdl_photo_path, driver.medical_card_photo_path].filter(
          (path): path is string => !!path
        )
      )
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
    ...driverRows.flatMap((driver) =>
      (
        [
          ["cdl", "CDL", driver.cdl_photo_path],
          ["medical", "Medical card", driver.medical_card_photo_path],
        ] as const
      )
        .filter(([, , path]) => !!path)
        .map(([key, type, path]) => ({
          key: `driver:${driver.id}:${key}`,
          group: "driver" as const,
          type,
          file_name: `${driver.full_name} ${type}`,
          owner: driver.full_name,
          path: `drivers/${driver.id}`,
          date: driver.updated_at,
          url: driverUrls.get(path!) ?? null,
        }))
    ),
  ]
  return entries.sort((a, b) => b.date.localeCompare(a.date))
}
