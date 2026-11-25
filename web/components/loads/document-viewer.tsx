"use client"

import { cn } from "cn"
import { Download, FileText, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type ViewableFile = {
  /** A short-lived signed link to the file. */
  url: string
  name: string
  /** Its content type, e.g. "image/webp" or "application/pdf". */
  type: string
}

const EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/heic": "heic",
  "application/pdf": "pdf",
}

/**
 * The name to save the file as. Photos are stored as WebP after they're
 * shrunk, so "bol.jpg" saves as "bol.webp" to match what's inside.
 */
function downloadName(file: ViewableFile) {
  const extension = EXTENSIONS[file.type]
  if (!extension) return file.name
  const base = file.name.replace(/\.[^./]+$/, "") || "document"
  return `${base}.${extension}`
}

/** Saves the file under its own name. */
async function download(file: ViewableFile) {
  // The link is on another origin, so the browser ignores a download
  // attribute on it; fetch it and save the bytes instead.
  const response = await fetch(file.url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const blob = await response.blob()
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = href
  anchor.download = downloadName(file)
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(href)
}

/**
 * A file's name as a link that opens it in a popup (a photo, or a PDF in the
 * browser's viewer), with a button to download it.
 */
export function DocumentLink({
  file,
  label,
  className,
}: {
  file: ViewableFile
  /** What the link says; the file name by default. */
  label?: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  // PDFs are shown from a local copy: the storage server won't let its own
  // address be shown inside another site's page.
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfFailed, setPdfFailed] = useState(false)
  const image = file.type.startsWith("image/") && file.type !== "image/heic"
  const pdf = file.type === "application/pdf"

  useEffect(() => {
    if (!open || file.type !== "application/pdf") return
    let href: string | null = null
    let cancelled = false
    fetch(file.url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.blob()
      })
      .then((blob) => {
        if (cancelled) return
        href = URL.createObjectURL(
          new Blob([blob], { type: "application/pdf" })
        )
        setPdfUrl(href)
      })
      .catch(() => !cancelled && setPdfFailed(true))
    return () => {
      cancelled = true
      if (href) URL.revokeObjectURL(href)
      setPdfUrl(null)
      setPdfFailed(false)
    }
  }, [open, file.url, file.type])

  async function save() {
    setSaving(true)
    try {
      await download(file)
    } catch {
      toast.error("Couldn't download the file. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex min-w-0 items-center gap-1.5 text-left text-muted-foreground hover:text-foreground hover:underline",
          className
        )}
      >
        <FileText className="size-3.5 shrink-0" />
        <span className="truncate">{label ?? file.name}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[85svh] max-w-[calc(100%-2rem)] flex-col gap-4 sm:max-w-4xl">
          <DialogHeader className="flex-row items-center justify-between gap-3 pr-8">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="truncate">{file.name}</DialogTitle>
              <DialogDescription className="sr-only">
                A preview of the file, with a button to download it.
              </DialogDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={save}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Download />}
              Download
            </Button>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg border bg-muted/40">
            {image ? (
              // A signed link to a private file, so next/image can't optimize it.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={file.url}
                alt={file.name}
                className="max-h-full max-w-full object-contain"
              />
            ) : pdf && pdfUrl ? (
              <iframe
                src={pdfUrl}
                title={file.name}
                className="size-full rounded-lg bg-background"
              />
            ) : pdf && !pdfFailed ? (
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            ) : (
              <div className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
                <FileText className="size-8" />
                <p>
                  {pdf
                    ? "This PDF couldn't be shown here."
                    : "This kind of file can't be shown here."}
                </p>
                <Button size="sm" disabled={saving} onClick={save}>
                  <Download />
                  Download to view it
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
