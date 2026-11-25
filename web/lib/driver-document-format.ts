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
  "i9",
  "direct_deposit",
  "twic",
  "passport",
  "lease_agreement",
  "insurance",
  "training",
  "policy_ack",
  "accident_report",
  "citation",
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
  i9: "I-9 (work eligibility)",
  direct_deposit: "Direct deposit form",
  twic: "TWIC card",
  passport: "Passport",
  lease_agreement: "Lease agreement",
  insurance: "Certificate of insurance",
  training: "Training certificate",
  policy_ack: "Policy acknowledgment",
  accident_report: "Accident report",
  citation: "Ticket or citation",
  other: "Other",
}

/**
 * Kinds that don't run out, so the upload doesn't ask when they expire and
 * any date sent with them is dropped.
 */
export const UNDATED_DRIVER_KINDS: readonly DriverDocumentKind[] = [
  "w9",
  "i9",
  "direct_deposit",
  "policy_ack",
  "accident_report",
  "citation",
]

/**
 * Kinds whose expiration date is kept on the driver (the CDL card),
 * so the upload doesn't ask for it again.
 */
export const DATED_ON_DRIVER: Partial<
  Record<DriverDocumentKind, "cdl_expires_on" | "medical_card_expires_on">
> = {
  cdl: "cdl_expires_on",
  medical_card: "medical_card_expires_on",
}

export function isDriverDocumentKind(
  value: string
): value is DriverDocumentKind {
  return (DRIVER_DOCUMENT_KINDS as readonly string[]).includes(value)
}
