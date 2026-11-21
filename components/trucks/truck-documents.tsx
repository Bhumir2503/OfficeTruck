"use client"

import { removeTruckDocument } from "@/app/org/[slug]/equipment/actions"
import { DocumentsCard } from "@/components/documents-card"
import {
  DATED_ON_TRUCK,
  TRUCK_DOCUMENT_KINDS,
  TRUCK_DOCUMENT_LABELS,
  type TruckDocumentKind,
} from "@/lib/truck-document-format"
import { uploadTruckDocument } from "@/lib/truck-document-upload"
import type { TruckDocument } from "@/lib/trucks"

const KINDS = {
  addable: TRUCK_DOCUMENT_KINDS,
  labels: TRUCK_DOCUMENT_LABELS,
  datedElsewhere: DATED_ON_TRUCK,
}

/**
 * A truck's papers as a table. The registration, inspection report and
 * 2290 show the dates kept on the truck and its filings.
 */
export function TruckDocuments({
  organizationId,
  truckId,
  documents,
  dueByKind,
  canManage,
  warn,
  today,
}: {
  organizationId: string
  truckId: string
  documents: TruckDocument[]
  /** The dates kept on the truck for the kinds in DATED_ON_TRUCK. */
  dueByKind: Partial<Record<TruckDocumentKind, string | null>>
  canManage: boolean
  /** Parked and retired trucks don't need warnings. */
  warn: boolean
  /** "YYYY-MM-DD" */
  today: string
}) {
  return (
    <DocumentsCard
      documents={documents}
      kinds={KINDS}
      defaultKind="registration"
      dueFor={(doc) =>
        doc.kind in DATED_ON_TRUCK
          ? (dueByKind[doc.kind] ?? null)
          : doc.expires_on
      }
      upload={(input) => uploadTruckDocument(organizationId, truckId, input)}
      remove={(documentId) =>
        removeTruckDocument(organizationId, truckId, documentId)
      }
      canManage={canManage}
      warn={warn}
      today={today}
      emptyText="Add the cab card, insurance card, inspection report, 2290 Schedule 1, lease and permits."
    />
  )
}
