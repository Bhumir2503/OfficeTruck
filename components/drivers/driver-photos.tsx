"use client"

import { FileText, ImageIcon, Upload } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { setDriverPhoto } from "@/app/org/[slug]/drivers/actions"
import { Button } from "@/components/ui/button"
import type { DriverPhotoKind } from "@/lib/drivers"
import { createClient } from "@/lib/supabase/client"

const BUCKET = "driver-documents"
const TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"]
const MAX_BYTES = 10 * 1024 * 1024
/** Phone photos are far bigger than needed to read a card. */
const MAX_SIDE = 2000

const LABELS: Record<DriverPhotoKind, string> = {
  cdl: "CDL",
  medical_card: "Medical card",
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

function PhotoSlot({
  organizationId,
  driverId,
  kind,
  url,
  isPdf,
  canManage,
}: {
  organizationId: string
  driverId: string
  kind: DriverPhotoKind
  url: string | null
  isPdf: boolean
  canManage: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<"upload" | "remove" | null>(null)
  const label = LABELS[kind]

  async function upload(file: File) {
    if (!TYPES.includes(file.type)) {
      toast.error("Choose a PNG, JPG or WebP photo, or a PDF.")
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error("Choose a file under 10 MB.")
      return
    }

    setPending("upload")
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
        toast.error(result.error)
        return
      }
      toast.success(`${label} ${url ? "replaced" : "added"}.`)
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? `Couldn't upload the file: ${error.message}`
          : "Couldn't upload the file. Please try again."
      )
    } finally {
      setPending(null)
    }
  }

  async function remove() {
    setPending("remove")
    const result = await setDriverPhoto(organizationId, driverId, kind, null)
    setPending(null)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(`${label} photo removed.`)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium">{label}</div>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="group relative flex aspect-[1.586] items-center justify-center overflow-hidden rounded-lg border bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={`Open the ${label.toLowerCase()} ${isPdf ? "PDF" : "photo"}`}
        >
          {isPdf ? (
            <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <FileText className="size-8" />
              Open PDF
            </span>
          ) : (
            // A signed URL that changes on every render; next/image can't cache it.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={`${label} photo`}
              className="size-full object-contain"
            />
          )}
        </a>
      ) : (
        <div className="flex aspect-[1.586] flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground">
          <ImageIcon className="size-6" />
          No {label === "CDL" ? "CDL" : "medical card"} on file
        </div>
      )}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!pending}
            onClick={() => inputRef.current?.click()}
          >
            <Upload />
            {pending === "upload" ? "Uploading…" : url ? "Replace" : "Upload"}
          </Button>
          {url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!!pending}
              onClick={remove}
            >
              {pending === "remove" ? "Removing…" : "Remove"}
            </Button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={TYPES.join(",")}
            className="hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ""
              if (file) {
                void upload(file)
              }
            }}
          />
        </div>
      )}
    </div>
  )
}

/** The CDL and medical card photos, side by side. */
export function DriverPhotos({
  organizationId,
  driverId,
  urls,
  paths,
  canManage,
}: {
  organizationId: string
  driverId: string
  urls: Record<DriverPhotoKind, string | null>
  paths: Record<DriverPhotoKind, string | null>
  canManage: boolean
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {(["cdl", "medical_card"] as const).map((kind) => (
        <PhotoSlot
          key={kind}
          organizationId={organizationId}
          driverId={driverId}
          kind={kind}
          url={urls[kind]}
          isPdf={!!paths[kind]?.endsWith(".pdf")}
          canManage={canManage}
        />
      ))}
    </div>
  )
}
