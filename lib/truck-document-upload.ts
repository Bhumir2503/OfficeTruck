"use client"

import { addTruckDocument } from "@/app/org/[slug]/equipment/actions"
import { driverFileError, shrink } from "@/lib/driver-document-upload"
import {
  TRUCK_DOCUMENT_LABELS,
  type TruckDocumentKind,
} from "@/lib/truck-document-format"
import { createClient } from "@/lib/supabase/client"

// Matches the truck-documents bucket's limits in the migration.
const BUCKET = "truck-documents"

export type TruckFile = { path: string; name: string; type: string }

/**
 * Puts a photo or PDF in the truck's folder, shrinking photos first. The
 * file name starts with `prefix` ("insurance", "receipt"). Returns where it
 * went, or an error message.
 */
export async function uploadTruckFile(
  organizationId: string,
  truckId: string,
  prefix: string,
  file: File
): Promise<(TruckFile & { size: number }) | { error: string }> {
  // Same file rules as driver documents.
  const problem = driverFileError(file)
  if (problem) {
    return { error: problem }
  }
  try {
    const pdf = file.type === "application/pdf"
    const body = pdf ? file : await shrink(file)
    const type = pdf ? "application/pdf" : "image/webp"
    const path = `${organizationId}/${truckId}/${prefix}-${crypto.randomUUID()}.${pdf ? "pdf" : "webp"}`
    const { error } = await createClient()
      .storage.from(BUCKET)
      .upload(path, body, { contentType: type })
    if (error) {
      throw error
    }
    return { path, name: file.name.slice(0, 200), type, size: body.size }
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message
          ? `Couldn't upload the file: ${error.message}`
          : "Couldn't upload the file. Please try again.",
    }
  }
}

/** Takes back a file whose record didn't save. Best effort. */
export async function removeTruckFile(path: string) {
  await createClient().storage.from(BUCKET).remove([path])
}

/**
 * Uploads a photo or PDF to the truck's folder and records it as a document
 * of `kind`. Photos are shrunk first. Returns an error message, or null.
 */
export async function uploadTruckDocument(
  organizationId: string,
  truckId: string,
  input: {
    kind: TruckDocumentKind
    title: string
    expires_on: string
    file: File
  }
): Promise<string | null> {
  const { file, kind } = input
  const uploaded = await uploadTruckFile(
    organizationId,
    truckId,
    kind.replaceAll("_", "-"),
    file
  )
  if ("error" in uploaded) {
    return uploaded.error
  }
  const result = await addTruckDocument(organizationId, truckId, {
    kind,
    title: input.title,
    expires_on: input.expires_on,
    path: uploaded.path,
    file_name: uploaded.name || TRUCK_DOCUMENT_LABELS[kind],
    content_type: uploaded.type,
    size_bytes: uploaded.size,
  })
  if ("error" in result) {
    await removeTruckFile(uploaded.path)
    return result.error
  }
  return null
}
