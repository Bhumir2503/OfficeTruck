"use server"

import { getMyOrganizations, getUser } from "@/lib/organizations"
import {
  MAX_READ_BYTES,
  READABLE_TYPES,
  type ReadableType,
  readRateCon,
  type ReadResult,
} from "@/lib/rate-con-reader"

async function isMember(organizationId: string) {
  const user = await getUser()
  return (
    !!user &&
    (await getMyOrganizations()).some((org) => org.id === organizationId)
  )
}

/**
 * Reads a rate con (form field "file", a PDF or photo) so New Load can be
 * filled in from it. Saves nothing: the person checks the form and saves.
 * `today` is the person's local date, "YYYY-MM-DD", for dates with no year.
 */
export async function readRateConFile(
  organizationId: string,
  formData: FormData
): Promise<ReadResult> {
  if (!(await isMember(organizationId))) {
    return { ok: false, error: "You're not a member of this organization." }
  }
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return { ok: false, error: "Choose a rate con to read." }
  }
  if (!READABLE_TYPES.includes(file.type as ReadableType)) {
    return { ok: false, error: "Choose a photo (PNG, JPG or WebP) or a PDF." }
  }
  if (file.size > MAX_READ_BYTES) {
    return { ok: false, error: "Choose a file under 20 MB." }
  }
  const today = String(formData.get("today") ?? "")
  return readRateCon(
    Buffer.from(await file.arrayBuffer()),
    file.type as ReadableType,
    /^\d{4}-\d{2}-\d{2}$/.test(today)
      ? today
      : new Date().toISOString().slice(0, 10)
  )
}
