"use client"

import { addLoadDocument } from "@/app/org/[slug]/loads/actions"
import type { DocumentKind } from "@/lib/load-document-format"
import { createClient } from "@/lib/supabase/client"

// Matches the load-documents bucket's limits in the migration.
const BUCKET = "load-documents"
// What the file picker offers. HEIC is left out on purpose: when it isn't
// listed, iPhones convert photos to JPEG as they're picked, so they're
// compressed like any other photo and show in the viewer.
export const DOCUMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]
/** HEIC can still arrive (dragged in on a Mac, say); it's compressed if the browser can read it. */
const HEIC = "image/heic"
const MAX_BYTES = 20 * 1024 * 1024
/** Big enough to read a BOL's small print, small enough to send. */
const MAX_SIDE = 2400

/** Why a file can't be used, or null if it's fine. */
export function documentFileError(file: File) {
  if (!DOCUMENT_TYPES.includes(file.type) && file.type !== HEIC) {
    return "Choose a photo (PNG, JPG or WebP) or a PDF."
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

/** Removes files uploaded with uploadLoadFile, e.g. when saving them failed. */
export async function removeLoadFiles(paths: string[]) {
  await createClient().storage.from(BUCKET).remove(paths)
}

/**
 * Uploads a photo or PDF to the load's folder, named `<prefix>-<random>`.
 * Photos are shrunk first. Returns where it went, or an error message.
 */
export async function uploadLoadFile(
  organizationId: string,
  loadId: string,
  prefix: string,
  file: File
): Promise<
  { path: string; name: string; type: string; size: number } | { error: string }
> {
  const problem = documentFileError(file)
  if (problem) {
    return { error: problem }
  }
  try {
    // PDFs go up as they are: compressing one means redrawing its pages as
    // pictures, which loses the text and can blur signatures. Photos are
    // shrunk to WebP, HEIC included where the browser can read it.
    const pdf = file.type === "application/pdf"
    let body: Blob = file
    if (!pdf) {
      try {
        body = await shrink(file)
      } catch (error) {
        if (file.type === HEIC) {
          return {
            error:
              "This HEIC photo can't be read here. Save it as a JPG and try again.",
          }
        }
        throw error
      }
    }
    const type = pdf ? file.type : "image/webp"
    const extension = pdf ? "pdf" : "webp"
    const path = `${organizationId}/${loadId}/${prefix}-${crypto.randomUUID()}.${extension}`
    const { error } = await createClient()
      .storage.from(BUCKET)
      .upload(path, body, { contentType: type })
    if (error) {
      throw error
    }
    return {
      path,
      name: file.name.slice(0, 200) || "Receipt",
      type,
      size: body.size,
    }
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message
          ? `Couldn't upload the file: ${error.message}`
          : "Couldn't upload the file. Please try again.",
    }
  }
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
  const uploaded = await uploadLoadFile(
    organizationId,
    loadId,
    kind.replace("_", "-"),
    file
  )
  if ("error" in uploaded) {
    return uploaded.error
  }
  const result = await addLoadDocument(organizationId, loadId, {
    kind,
    path: uploaded.path,
    file_name: uploaded.name,
    content_type: uploaded.type,
    size_bytes: uploaded.size,
  })
  if ("error" in result) {
    await removeLoadFiles([uploaded.path])
    return result.error
  }
  return null
}
