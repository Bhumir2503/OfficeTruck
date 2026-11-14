import type { LoadStatus } from "@/lib/schemas/load"

// Keep in step with the checks on public.load_documents.

export const DOCUMENT_KINDS = [
  "rate_con",
  "bol",
  "pod",
  "lumper_receipt",
  "other",
] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  rate_con: "Rate con",
  bol: "BOL",
  pod: "POD",
  lumper_receipt: "Lumper receipt",
  other: "Other",
}

/**
 * The documents a load needs before it can be invoiced: the rate con, BOL
 * and POD, plus a lumper receipt when there's a lumper charge to back up.
 */
export function requiredDocuments(charges: { kind: string }[]): DocumentKind[] {
  const kinds: DocumentKind[] = ["rate_con", "bol", "pod"]
  if (charges.some((charge) => charge.kind === "lumper")) {
    kinds.push("lumper_receipt")
  }
  return kinds
}

/** Which required documents are still missing, in checklist order. */
export function missingDocuments(
  charges: { kind: string }[],
  documents: { kind: DocumentKind }[]
) {
  const have = new Set(documents.map((document) => document.kind))
  return requiredDocuments(charges).filter((kind) => !have.has(kind))
}

/** Loads past these have been invoiced, so the invoice line is done. */
export const INVOICED_STATUSES: LoadStatus[] = ["invoiced", "paid", "factored"]
