"use client"

import {
  removeDriverDocument,
  renameDriverDocument,
} from "@/app/org/[slug]/drivers/actions"
import { DocumentsCard } from "@/components/documents-card"
import {
  DATED_ON_DRIVER,
  DRIVER_DOCUMENT_KINDS,
  DRIVER_DOCUMENT_LABELS,
  UNDATED_DRIVER_KINDS,
  type DriverDocumentKind,
} from "@/lib/driver-document-format"
import { uploadDriverDocument } from "@/lib/driver-document-upload"
import type { Driver, DriverDocument } from "@/lib/drivers"

type Dates = Pick<Driver, "cdl_expires_on" | "medical_card_expires_on">

/**
 * Kept in the qualification file now, where they count toward Audit-ready.
 * Copies added here before stay listed, with a note.
 */
const IN_FILE: readonly DriverDocumentKind[] = [
  "mvr",
  "application",
  "road_test",
  "clearinghouse",
  "drug_test",
]

const KINDS = {
  // The CDL and medical card copies are uploaded on their own cards, and
  // the qualification file's records on their item, so Add document
  // offers only the other papers.
  addable: DRIVER_DOCUMENT_KINDS.filter(
    (kind) =>
      kind !== "cdl" && kind !== "medical_card" && !IN_FILE.includes(kind)
  ),
  labels: DRIVER_DOCUMENT_LABELS,
  undated: UNDATED_DRIVER_KINDS,
  datedElsewhere: {
    cdl: "Set on the CDL card.",
    medical_card: "Set on the Medical card card.",
  },
}

/**
 * A driver's papers as a table. The CDL and medical card copies show the
 * driver's own dates.
 */
export function DriverDocuments({
  id,
  organizationId,
  driverId,
  documents,
  dates,
  canManage,
  warn,
  today,
}: {
  /** For links that jump here. */
  id?: string
  organizationId: string
  driverId: string
  documents: DriverDocument[]
  /** CDL and medical card files show the driver's own dates. */
  dates: Dates
  canManage: boolean
  /** Inactive drivers aren't driving, so their dates don't need warnings. */
  warn: boolean
  /** "YYYY-MM-DD" */
  today: string
}) {
  return (
    <DocumentsCard
      id={id}
      documents={documents}
      kinds={KINDS}
      defaultKind="w9"
      dueFor={(doc) => {
        const field = DATED_ON_DRIVER[doc.kind]
        return field ? dates[field] : doc.expires_on
      }}
      upload={(input) => uploadDriverDocument(organizationId, driverId, input)}
      remove={(documentId) =>
        removeDriverDocument(organizationId, driverId, documentId)
      }
      rename={(documentId, name) =>
        renameDriverDocument(organizationId, driverId, documentId, name)
      }
      canManage={canManage}
      warn={warn}
      today={today}
      emptyText="Add a W-9 or other papers. The CDL and medical card go on their own cards, and driving records, tests and the application in the qualification file."
      noteFor={(doc) =>
        IN_FILE.includes(doc.kind)
          ? "Add this to the qualification file to count it."
          : null
      }
    />
  )
}
