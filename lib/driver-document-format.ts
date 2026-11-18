// Keep in step with the checks on public.driver_documents.

export const DRIVER_DOCUMENT_KINDS = [
  "cdl",
  "medical_card",
  "mvr",
  "drug_test",
  "application",
  "road_test",
  "clearinghouse",
  "w9",
  "other",
] as const
export type DriverDocumentKind = (typeof DRIVER_DOCUMENT_KINDS)[number]

export const DRIVER_DOCUMENT_LABELS: Record<DriverDocumentKind, string> = {
  cdl: "CDL",
  medical_card: "Medical card",
  mvr: "Driving record (MVR)",
  drug_test: "Drug test result",
  application: "Employment application",
  road_test: "Road test certificate",
  clearinghouse: "Clearinghouse consent",
  w9: "W-9",
  other: "Other",
}

/**
 * Kinds whose expiration date is kept on the driver (the CDL card),
 * so the upload doesn't ask for it again.
 */
export const DATED_ON_DRIVER: Partial<
  Record<DriverDocumentKind, "cdl_expires_on">
> = {
  cdl: "cdl_expires_on",
}

export function isDriverDocumentKind(
  value: string
): value is DriverDocumentKind {
  return (DRIVER_DOCUMENT_KINDS as readonly string[]).includes(value)
}
