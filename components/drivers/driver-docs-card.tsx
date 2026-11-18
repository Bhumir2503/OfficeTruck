"use client"

import { cn } from "cn"
import { FileText, IdCard, Upload, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { DocumentLink } from "@/components/loads/document-viewer"
import { Button } from "@/components/ui/button"
import { driverFileError, FILE_TYPES } from "@/lib/driver-document-upload"

const KINDS = ["cdl", "medical_card"] as const
export type DocKind = (typeof KINDS)[number]
export type DocFiles = Record<DocKind, File | null>

const LABELS: Record<DocKind, { name: string; card: string }> = {
  cdl: { name: "CDL", card: "CDL" },
  medical_card: { name: "medical card", card: "Medical card" },
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

function DocSlot({
  kind,
  file,
  onPick,
  onRemove,
}: {
  kind: DocKind
  file: File | null
  onPick: (file: File) => void
  onRemove: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const url = useObjectUrl(file)
  const { name, card } = LABELS[kind]
  const Icon = kind === "cdl" ? IdCard : FileText

  const picker = (
    <input
      ref={input}
      type="file"
      accept={FILE_TYPES.join(",")}
      className="sr-only"
      tabIndex={-1}
      onChange={(event) => {
        const picked = event.currentTarget.files?.[0]
        event.currentTarget.value = ""
        if (picked) onPick(picked)
      }}
    />
  )

  if (!file) {
    return (
      <div>
        {picker}
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const dropped = event.dataTransfer.files?.[0]
            if (dropped) onPick(dropped)
          }}
          className={cn(
            "flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/[0.03] px-4 py-8 text-center text-sm transition-colors hover:border-primary hover:bg-primary/5",
            dragging && "border-primary bg-primary/10"
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
          <span className="font-medium">Drop the {name} here</span>
          <span className="text-xs text-muted-foreground">
            PDF or photo, or click to choose
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
      {picker}
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{card}</p>
        {url ? (
          <DocumentLink
            file={{ url, name: file.name, type: file.type }}
            className="text-xs"
          />
        ) : (
          <p className="truncate text-xs">{file.name}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => input.current?.click()}
        >
          <Upload /> Replace
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove the ${name}`}
          onClick={onRemove}
        >
          <X />
        </Button>
      </div>
    </div>
  )
}

/**
 * The card beside Add driver: attach the CDL and medical card, held by the
 * form and saved to the driver's documents with the driver. `children` goes
 * below them: saving.
 */
export function DriverDocsCard({
  className,
  files,
  onFilesChange,
  children,
}: {
  className?: string
  files: DocFiles
  onFilesChange: (kind: DocKind, file: File | null) => void
  children?: React.ReactNode
}) {
  function pick(kind: DocKind, file: File) {
    const problem = driverFileError(file)
    if (problem) {
      toast.error(problem)
      return
    }
    onFilesChange(kind, file)
  }

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs",
        className
      )}
    >
      <div className="px-5 pt-4 pb-5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          New driver
        </p>
        <h4 className="mt-1 text-xl font-semibold tracking-tight">
          Their documents
        </h4>
        <p className="mt-2 text-sm text-muted-foreground">
          Attach their CDL and medical card. Both are saved to the driver&apos;s
          documents when you save.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {KINDS.map((kind) => (
            <DocSlot
              key={kind}
              kind={kind}
              file={files[kind]}
              onPick={(file) => pick(kind, file)}
              onRemove={() => onFilesChange(kind, null)}
            />
          ))}
        </div>
        {children && (
          <div className="mt-5 flex flex-col gap-2 border-t pt-5">
            {children}
          </div>
        )}
      </div>
    </section>
  )
}
