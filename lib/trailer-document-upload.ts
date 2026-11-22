"use client"

import { addTrailerDocument } from "@/app/org/[slug]/trailers/actions"
import {
  TRAILER_DOCUMENT_LABELS,
  type TrailerDocumentKind,
} from "@/lib/trailer-document-format"
import { removeTruckFile, uploadTruckFile } from "@/lib/truck-document-upload"

/**
 * Uploads a photo or PDF to the trailer's folder and records it as a
 * document of `kind`. Returns an error message, or null.
 */
export async function uploadTrailerDocument(
  organizationId: string,
  trailerId: string,
  input: {
    kind: TrailerDocumentKind
    title: string
    expires_on: string
    file: File
  }
): Promise<string | null> {
  const { file, kind } = input
  const uploaded = await uploadTruckFile(
    organizationId,
    trailerId,
    kind.replaceAll("_", "-"),
    file
  )
  if ("error" in uploaded) {
    return uploaded.error
  }
  const result = await addTrailerDocument(organizationId, trailerId, {
    kind,
    title: input.title,
    expires_on: input.expires_on,
    path: uploaded.path,
    file_name: uploaded.name || TRAILER_DOCUMENT_LABELS[kind],
    content_type: uploaded.type,
    size_bytes: uploaded.size,
  })
  if ("error" in result) {
    await removeTruckFile(uploaded.path)
    return result.error
  }
  return null
}
