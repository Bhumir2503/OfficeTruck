// Keep in step with the checks on public.truck_documents.

export const TRUCK_DOCUMENT_KINDS = [
  "registration",
  "insurance",
  "annual_inspection",
  "form_2290",
  "ifta",
  "lease",
  "permit",
  "title",
  "maintenance",
  "other",
] as const
export type TruckDocumentKind = (typeof TRUCK_DOCUMENT_KINDS)[number]

export const TRUCK_DOCUMENT_LABELS: Record<TruckDocumentKind, string> = {
  registration: "Registration or IRP cab card",
  insurance: "Insurance card",
  annual_inspection: "Annual inspection report",
  form_2290: "2290 Schedule 1",
  ifta: "IFTA license",
  lease: "Lease agreement",
  permit: "State permit",
  title: "Title",
  maintenance: "Maintenance record",
  other: "Other",
}

/**
 * Kinds whose date is kept on the truck (or its 2290 filing), so the upload
 * doesn't ask for it again. The value says where it's set.
 */
export const DATED_ON_TRUCK: Partial<Record<TruckDocumentKind, string>> = {
  registration: "Set on the Plate and compliance card.",
  annual_inspection: "Set on the Plate and compliance card.",
  form_2290: "Set by the 2290 filings on Compliance.",
}

export function isTruckDocumentKind(value: string): value is TruckDocumentKind {
  return (TRUCK_DOCUMENT_KINDS as readonly string[]).includes(value)
}
