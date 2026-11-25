import { idParam, json, respond, signInFirst } from "@/lib/dq/http"
import { uploadDocument } from "@/lib/dq/service"
import { DQ_MAX_UPLOAD_BYTES } from "@/lib/schemas/dq"
import { createRequestClient } from "@/lib/supabase/request"

/**
 * Uploads a photo or PDF to an item, as multipart form data with a "file"
 * field. Owners and admins to any item; the driver to their own standard
 * DQ items. Waits for review until an owner or admin confirms it.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/dq/items/[itemId]/documents">
) {
  const id = idParam((await ctx.params).itemId)
  if (id instanceof Response) return id
  const { supabase, signedIn } = await createRequestClient(request)
  if (!signedIn) return signInFirst()
  if (
    Number(request.headers.get("content-length") ?? 0) >
    DQ_MAX_UPLOAD_BYTES + 64 * 1024
  ) {
    return json({ error: "Files can be up to 10 MB." }, 413)
  }
  let file: FormDataEntryValue | null
  try {
    file = (await request.formData()).get("file")
  } catch {
    return json({ error: "Send the file as form data." }, 400)
  }
  if (!(file instanceof File))
    return json({ error: "Choose a file to upload." }, 400)
  return respond(await uploadDocument(supabase, id, file), 201)
}
