// Keep in step with the checks on public.company_documents.

export const COMPANY_DOCUMENT_KINDS = [
  "authority",
  "insurance",
  "w9",
  "boc3",
  "ucr",
  "irp",
  "ifta_license",
  "permit",
  "other",
] as const
export type CompanyDocumentKind = (typeof COMPANY_DOCUMENT_KINDS)[number]

export const COMPANY_DOCUMENT_LABELS: Record<CompanyDocumentKind, string> = {
  authority: "Operating authority",
  insurance: "Insurance certificate",
  w9: "W-9",
  boc3: "BOC-3",
  ucr: "UCR",
  irp: "IRP cab card",
  ifta_license: "IFTA license",
  permit: "Permit",
  other: "Other",
}

/** Where a document in the "all documents" list belongs. */
export const DOCUMENT_GROUPS = [
  "company",
  "load",
  "driver",
  "truck",
  "receipt",
] as const
export type DocumentGroup = (typeof DOCUMENT_GROUPS)[number]

export const DOCUMENT_GROUP_LABELS: Record<DocumentGroup, string> = {
  company: "Company",
  load: "Loads",
  driver: "Drivers",
  truck: "Trucks",
  receipt: "Receipts",
}

/** One file anywhere in the organization, as the Documents page lists it. */
export type DocumentEntry = {
  key: string
  group: DocumentGroup
  /** "POD", "CDL", "Insurance certificate" */
  type: string
  file_name: string
  /** Who or what it's for: a load reference, a driver's name, a unit number, "Company". */
  owner: string
  /** Below /org/<slug>, the page it belongs to, or null. */
  path: string | null
  /** "YYYY-MM-DD" or an ISO timestamp; sorts newest first. */
  date: string
  /** A link that works for an hour, or null. */
  url: string | null
}

/** Entries in `group` (or all) whose type, file name or owner match `query`. */
export function filterDocuments(
  entries: DocumentEntry[],
  group: DocumentGroup | "all",
  query: string
) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return entries.filter(
    (entry) =>
      (group === "all" || entry.group === group) &&
      words.every((word) =>
        `${entry.type} ${entry.file_name} ${entry.owner}`
          .toLowerCase()
          .includes(word)
      )
  )
}
