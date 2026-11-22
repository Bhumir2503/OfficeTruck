"use client"

import { removeTrailerDocument } from "@/app/org/[slug]/trailers/actions"
import { DocumentsCard } from "@/components/documents-card"
import {
  DATED_ON_TRAILER,
  TRAILER_DOCUMENT_DATE_LABELS,
  TRAILER_DOCUMENT_KINDS,
  TRAILER_DOCUMENT_LABELS,
  type TrailerDocumentKind,
} from "@/lib/trailer-document-format"
import { uploadTrailerDocument } from "@/lib/trailer-document-upload"
import type { TrailerDocument } from "@/lib/trailers"

const KINDS = {
  addable: TRAILER_DOCUMENT_KINDS,
  labels: TRAILER_DOCUMENT_LABELS,
  datedElsewhere: DATED_ON_TRAILER,
  dateLabels: TRAILER_DOCUMENT_DATE_LABELS,
  // The inspection report's date is when the next inspection is due.
  dueKinds: ["annual_inspection"] as const,
}

/**
 * A trailer's papers as a table. The registration and inspection report
 * show the dates kept on the trailer.
 */
export function TrailerDocuments({
  organizationId,
  trailerId,
  documents,
  dueByKind,
  canManage,
  warn,
  today,
}: {
  organizationId: string
  trailerId: string
  documents: TrailerDocument[]
  /** The dates kept on the trailer for the registration and inspection. */
  dueByKind: Partial<Record<TrailerDocumentKind, string | null>>
  canManage: boolean
  /** Parked and retired trailers don't need warnings. */
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
        doc.kind in dueByKind ? (dueByKind[doc.kind] ?? null) : doc.expires_on
      }
      upload={(input) =>
        uploadTrailerDocument(organizationId, trailerId, input)
      }
      remove={(documentId) =>
        removeTrailerDocument(organizationId, trailerId, documentId)
      }
      canManage={canManage}
      warn={warn}
      today={today}
      emptyText="Add the registration, inspection report, lease and title."
    />
  )
}
