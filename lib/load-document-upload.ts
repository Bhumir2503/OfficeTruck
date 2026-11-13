"use client"

import { addLoadDocument } from "@/app/org/[slug]/loads/actions"
import type { DocumentKind } from "@/lib/load-document-format"
import { createClient } from "@/lib/supabase/client"

// Matches the load-documents bucket's limits in the migration.
const BUCKET = "load-documents"
export const DOCUMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "application/pdf",
]
const MAX_BYTES = 20 * 1024 * 1024
/** Big enough to read a BOL's small print, small enough to send. */
const MAX_SIDE = 2400

/** Why a file can't be used, or null if it's fine. */
export function documentFileError(file: File) {
  if (!DOCUMENT_TYPES.includes(file.type)) {
    return "Choose a photo (PNG, JPG, WebP or HEIC) or a PDF."
  }
  if (file.size > MAX_BYTES) {
    return "Choose a file under 20 MB."
  }
  return null
}

/** Shrinks a photo to at most 2400px on its longest side, as WebP. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Canvas isn't supported.")
  }
  context.imageSmoothingQuality = "high"
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Couldn't read the image.")),
      "image/webp",
      0.85
    )
  )
}

/**
 * Uploads a file to the load's folder and records it as a document of
 * `kind`. Returns an error message, or null.
 */
export async function uploadLoadDocument(
  organizationId: string,
  loadId: string,
  kind: DocumentKind,
  file: File
): Promise<string | null> {
  const problem = documentFileError(file)
  if (problem) {
    return problem
  }
  try {
    // PDFs and HEIC photos (which browsers can't redraw) go up as they are.
    const asIs = file.type === "application/pdf" || file.type === "image/heic"
    const body = asIs ? file : await shrink(file)
    const contentType = asIs ? file.type : "image/webp"
    const extension =
      contentType === "application/pdf"
        ? "pdf"
        : contentType === "image/heic"
          ? "heic"
          : "webp"
    const path = `${organizationId}/${loadId}/${kind.replace("_", "-")}-${crypto.randomUUID()}.${extension}`
    const storage = createClient().storage.from(BUCKET)
    const { error } = await storage.upload(path, body, { contentType })
    if (error) {
      throw error
    }
    const result = await addLoadDocument(organizationId, loadId, {
      kind,
      path,
      file_name: file.name.slice(0, 200) || "Document",
      content_type: contentType,
      size_bytes: body.size,
    })
    if ("error" in result) {
      await storage.remove([path])
      return result.error
    }
    return null
  } catch (error) {
    return error instanceof Error && error.message
      ? `Couldn't upload the file: ${error.message}`
      : "Couldn't upload the file. Please try again."
  }
}
