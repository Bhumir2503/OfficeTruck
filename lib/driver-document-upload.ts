"use client"

import { addDriverDocument } from "@/app/org/[slug]/drivers/actions"
import {
  DRIVER_DOCUMENT_LABELS,
  type DriverDocumentKind,
} from "@/lib/driver-document-format"
import { createClient } from "@/lib/supabase/client"

// Matches the driver-documents bucket's limits in the migration.
const BUCKET = "driver-documents"
export const FILE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]
const MAX_BYTES = 10 * 1024 * 1024
/** Phone photos are far bigger than needed to read a card. */
const MAX_SIDE = 2000

/** Why a file can't be used, or null if it's fine. */
export function driverFileError(file: File) {
  if (!FILE_TYPES.includes(file.type)) {
    return "Choose a PNG, JPG or WebP photo, or a PDF."
  }
  if (file.size > MAX_BYTES) {
    return "Choose a file under 10 MB."
  }
  return null
}

/** Shrinks a photo to at most 2000px on its longest side, as WebP. */
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
 * Uploads a photo or PDF to the driver's folder and records it as a document
 * of `kind`. Photos are shrunk first. Returns an error message, or null.
 */
export async function uploadDriverDocument(
  organizationId: string,
  driverId: string,
  input: {
    kind: DriverDocumentKind
    title: string
    expires_on: string
    file: File
  }
): Promise<string | null> {
  const { file, kind } = input
  const problem = driverFileError(file)
  if (problem) {
    return problem
  }
  try {
    const pdf = file.type === "application/pdf"
    const body = pdf ? file : await shrink(file)
    const type = pdf ? "application/pdf" : "image/webp"
    const path = `${organizationId}/${driverId}/${kind.replaceAll("_", "-")}-${crypto.randomUUID()}.${pdf ? "pdf" : "webp"}`
    const storage = createClient().storage.from(BUCKET)
    const { error } = await storage.upload(path, body, { contentType: type })
    if (error) {
      throw error
    }
    const result = await addDriverDocument(organizationId, driverId, {
      kind,
      title: input.title,
      expires_on: input.expires_on,
      path,
      file_name: file.name.slice(0, 200) || DRIVER_DOCUMENT_LABELS[kind],
      content_type: type,
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
