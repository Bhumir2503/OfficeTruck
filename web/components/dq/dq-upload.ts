"use client"

import { dqFetch } from "@/components/dq/dq-api"
import {
  DOCUMENT_TYPES,
  documentFileError,
  shrink,
} from "@/lib/load-document-upload"

/*
 * Uploads a DQ document the same way loads take BOLs and PODs: the same
 * file picker types, and photos shrunk to WebP in the browser before they're
 * sent (the audit export turns them into JPEG for the PDF).
 */

export const DQ_ACCEPT = DOCUMENT_TYPES.join(",")
const MAX_BYTES = 10 * 1024 * 1024

export type UploadResult = {
  id: string
  ai_extraction: Record<string, unknown> | null
}

export async function uploadDqFile(itemId: string, file: File, token?: string) {
  const invalid = documentFileError(file)
  if (invalid) return { ok: false as const, error: invalid }

  let upload: File = file
  if (file.type !== "application/pdf") {
    try {
      const blob = await shrink(file)
      const name = file.name.replace(/\.[^.]+$/, "") || "photo"
      upload = new File([blob], `${name}.webp`, { type: "image/webp" })
    } catch {
      // Sent as it is if the browser can't read it.
    }
  }
  if (upload.size > MAX_BYTES) {
    return { ok: false as const, error: "Choose a file under 10 MB." }
  }

  const form = new FormData()
  form.set("file", upload)
  return dqFetch<UploadResult>(`items/${itemId}/documents`, { form, token })
}
