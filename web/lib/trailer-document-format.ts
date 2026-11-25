import { TRUCK_DOCUMENT_LABELS } from "@/lib/truck-document-format"

// Keep in step with the checks on public.trailer_documents.

export const TRAILER_DOCUMENT_KINDS = [
  "registration",
  "insurance",
  "annual_inspection",
  "lease",
  "title",
  "maintenance",
  "other",
] as const
export type TrailerDocumentKind = (typeof TRAILER_DOCUMENT_KINDS)[number]

export const TRAILER_DOCUMENT_LABELS: Record<TrailerDocumentKind, string> = {
  ...TRUCK_DOCUMENT_LABELS,
  registration: "Registration",
}

/** Kinds whose date is kept on the trailer, so the upload doesn't ask. */
export const DATED_ON_TRAILER: Partial<Record<TrailerDocumentKind, string>> = {
  registration: "Set on the Plate and compliance card.",
}

/** The inspection report's date becomes the trailer's last inspection. */
export const TRAILER_DOCUMENT_DATE_LABELS: Partial<
  Record<TrailerDocumentKind, string>
> = {
  annual_inspection: "Inspected on",
}

export function isTrailerDocumentKind(
  value: string
): value is TrailerDocumentKind {
  return (TRAILER_DOCUMENT_KINDS as readonly string[]).includes(value)
}
