"use client"

import { cn } from "cn"
import { FileText, IdCard, Upload, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { DocumentLink } from "@/components/loads/document-viewer"
import { Button } from "@/components/ui/button"
import { driverFileError, FILE_TYPES } from "@/lib/driver-document-upload"

export type DocKind = "cdl" | "medical_card"
export type DocFiles = Record<DocKind, File | null>

const LABELS: Record<DocKind, string> = {
  cdl: "Copy of the CDL",
  medical_card: "Copy of the medical card",
}

/** A local link to a picked file, revoked when it's replaced or removed. */
function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) return
    const next = URL.createObjectURL(file)
    const timer = setTimeout(() => setUrl(next), 0)
    return () => {
      clearTimeout(timer)
      URL.revokeObjectURL(next)
      setUrl(null)
    }
  }, [file])
  return url
}

/**
 * On Add driver, a photo or PDF of the CDL or medical card, held by the form
 * until the driver is saved and then uploaded to their documents. Looks like
 * the copy row on the driver page, which saves straight away. Its file input
 * has no name, so the form's own values leave it out.
 */
export function PendingCopyField({
  kind,
  file,
  onChange,
}: {
  kind: DocKind
  file: File | null
  onChange: (file: File | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const url = useObjectUrl(file)
  const label = LABELS[kind]
  const Icon = kind === "cdl" ? IdCard : FileText

  function pick(picked: File | undefined) {
    if (!picked) return
    const problem = driverFileError(picked)
    if (problem) {
      toast.error(problem)
      return
    }
    onChange(picked)
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 transition-colors sm:col-span-6",
        file ? "bg-card" : "border-dashed",
        dragging && "border-brand bg-brand/5"
      )}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        pick(event.dataTransfer.files?.[0])
      }}
    >
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-md",
          file ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground"
        )}
      >
        {file ? <FileText className="size-5" /> : <Icon className="size-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        {file && url ? (
          <DocumentLink
            file={{ url, name: file.name, type: file.type }}
            className="text-xs"
          />
        ) : file ? (
          <p className="truncate text-xs">{file.name}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Drop a photo or PDF here. It&apos;s saved with the driver.
          </p>
        )}
      </div>
      <Button
        type="button"
        size="sm"
        variant={file ? "ghost" : "outline"}
        className="shrink-0"
        onClick={() => input.current?.click()}
      >
        <Upload /> {file ? "Replace" : "Upload"}
      </Button>
      {file && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove the ${label.toLowerCase()}`}
          className="-ml-2 shrink-0"
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept={FILE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const picked = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          pick(picked)
        }}
      />
    </div>
  )
}
