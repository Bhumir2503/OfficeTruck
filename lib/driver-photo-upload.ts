"use client"

import { setDriverPhoto } from "@/app/org/[slug]/drivers/actions"
import type { DriverPhotoKind } from "@/lib/drivers"
import { createClient } from "@/lib/supabase/client"

// Matches the driver-documents bucket's limits in the migration.
const BUCKET = "driver-documents"
export const PHOTO_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]
const MAX_BYTES = 10 * 1024 * 1024
/** Phone photos are far bigger than needed to read a card. */
const MAX_SIDE = 2000

export const PHOTO_LABELS: Record<DriverPhotoKind, string> = {
  cdl: "CDL",
  medical_card: "Medical card",
}

/** Why a file can't be used, or null if it's fine. */
export function photoFileError(file: File) {
  if (!PHOTO_TYPES.includes(file.type)) {
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
 * Uploads a CDL or medical card file to the driver's folder and points the
 * driver at it, replacing any earlier one. Returns an error message, or null.
 */
export async function uploadDriverPhoto(
  organizationId: string,
  driverId: string,
  kind: DriverPhotoKind,
  file: File
): Promise<string | null> {
  const problem = photoFileError(file)
  if (problem) {
    return problem
  }
  try {
    const pdf = file.type === "application/pdf"
    const body = pdf ? file : await shrink(file)
    // A new name each time, so a replaced photo is never served stale.
    const path = `${organizationId}/${driverId}/${kind.replace("_", "-")}-${crypto.randomUUID()}.${pdf ? "pdf" : "webp"}`
    const storage = createClient().storage.from(BUCKET)
    const { error } = await storage.upload(path, body, {
      contentType: pdf ? "application/pdf" : "image/webp",
    })
    if (error) {
      throw error
    }
    const result = await setDriverPhoto(organizationId, driverId, kind, path)
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
