"use client"

import { cn } from "cn"
import {
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { removeDriverDocument } from "@/app/org/[slug]/drivers/actions"
import { ExpiryBadge } from "@/components/drivers/driver-badges"
import { SettingsCard } from "@/components/settings/settings-card"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DATED_ON_DRIVER,
  DRIVER_DOCUMENT_KINDS,
  DRIVER_DOCUMENT_LABELS,
  type DriverDocumentKind,
} from "@/lib/driver-document-format"
import {
  FILE_TYPES,
  driverFileError,
  uploadDriverDocument,
} from "@/lib/driver-document-upload"
import { expiry, formatDate, needsAction } from "@/lib/driver-format"
import type { Driver, DriverDocument } from "@/lib/drivers"

type Dates = Pick<Driver, "cdl_expires_on">

/** Every driver needs these on file; they show as slots until uploaded. */
const ESSENTIALS = ["cdl", "medical_card"] as const

const sizeFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 })
const fileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${sizeFormat.format(bytes / 1024)} KB`
    : `${sizeFormat.format(bytes / 1024 / 1024)} MB`

/** The square on the left of each row: what kind of file it is. */
function FileTile({ pdf, empty }: { pdf?: boolean; empty?: boolean }) {
  const Icon = pdf ? FileText : ImageIcon
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg",
        empty ? "border border-dashed" : "bg-muted"
      )}
    >
      {empty ? (
        <Plus className="size-4 text-muted-foreground" />
      ) : (
        <Icon className="size-5 text-muted-foreground" />
      )}
    </div>
  )
}

/** The popup for adding a file: what it is, when it runs out, and the file. */
function AddDocumentDialog({
  organizationId,
  driverId,
  open,
  initialKind,
  onOpenChange,
}: {
  organizationId: string
  driverId: string
  open: boolean
  initialKind: DriverDocumentKind
  onOpenChange: (open: boolean) => void
}) {
  const [kind, setKind] = useState<DriverDocumentKind>(initialKind)
  const [title, setTitle] = useState("")
  const [expiresOn, setExpiresOn] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [pending, start] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  // CDL and medical card dates live in Compliance, so they aren't asked here.
  const datedOnDriver = !!DATED_ON_DRIVER[kind]

  function pick(next: File | null | undefined) {
    if (!next) return
    const problem = driverFileError(next)
    if (problem) {
      toast.error(problem)
      return
    }
    setFile(next)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add document</DialogTitle>
          <DialogDescription>
            A photo or PDF, up to 10 MB. Kept private to your organization.
          </DialogDescription>
        </DialogHeader>
        <form
          id="driver-document-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!file) return
            start(async () => {
              const error = await uploadDriverDocument(
                organizationId,
                driverId,
                {
                  kind,
                  title,
                  expires_on: datedOnDriver ? "" : expiresOn,
                  file,
                }
              )
              if (error) {
                toast.error(error)
                return
              }
              toast.success(`${DRIVER_DOCUMENT_LABELS[kind]} added.`)
              onOpenChange(false)
            })
          }}
        >
          <Field>
            <FieldLabel htmlFor="driver-doc-kind">Type</FieldLabel>
            <Select
              value={kind}
              onValueChange={(value) =>
                setKind((value as DriverDocumentKind) ?? initialKind)
              }
              items={DRIVER_DOCUMENT_KINDS.map((value) => ({
                value,
                label: DRIVER_DOCUMENT_LABELS[value],
              }))}
            >
              <SelectTrigger id="driver-doc-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DRIVER_DOCUMENT_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {DRIVER_DOCUMENT_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="driver-doc-expires">Expires</FieldLabel>
            {datedOnDriver ? (
              <FieldDescription className="pt-1.5">
                Set on the CDL card.
              </FieldDescription>
            ) : (
              <Input
                id="driver-doc-expires"
                type="date"
                value={expiresOn}
                onChange={(event) => setExpiresOn(event.target.value)}
              />
            )}
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="driver-doc-title">
              Name {kind !== "other" && "(optional)"}
            </FieldLabel>
            <Input
              id="driver-doc-title"
              placeholder={
                kind === "other" ? "What it is" : "e.g. Front and back"
              }
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          {/* A drop zone that's also the file picker. */}
          <label
            htmlFor="driver-doc-file"
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors hover:bg-muted/50 sm:col-span-2",
              dragging && "border-primary bg-muted/50"
            )}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              pick(event.dataTransfer.files[0])
            }}
          >
            <input
              id="driver-doc-file"
              ref={fileRef}
              type="file"
              className="sr-only"
              accept={FILE_TYPES.join(",")}
              onChange={(event) => pick(event.target.files?.[0])}
            />
            {file ? (
              <>
                <FileTile pdf={file.type === "application/pdf"} />
                <span className="max-w-full truncate text-sm font-medium">
                  {file.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {fileSize(file.size)} · Click to choose a different file
                </span>
              </>
            ) : (
              <>
                <Upload className="size-5 text-muted-foreground" />
                <span className="text-sm font-medium">
                  Drop a file here or click to choose
                </span>
                <span className="text-xs text-muted-foreground">
                  PNG, JPG, WebP or PDF
                </span>
              </>
            )}
          </label>
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="driver-document-form"
            disabled={pending || !file || (kind === "other" && !title.trim())}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Upload />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** When it runs out: a warning badge when it's close, else the date. */
function Expires({
  due,
  label,
  warn,
  today,
}: {
  due: string | null
  label: string
  warn: boolean
  today: string
}) {
  if (!due) return null
  const state = expiry(due, today)
  if (warn && needsAction(state.state)) {
    return (
      <ExpiryBadge
        item={{ key: label, label, kind: "expires", due, expiry: state }}
      />
    )
  }
  return (
    <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
      Expires {formatDate(due)}
    </span>
  )
}

/**
 * A driver's papers as a list: what each is, when it runs out and a link to
 * open it, with slots for the CDL and medical card until they're uploaded.
 */
export function DriverDocuments({
  id,
  organizationId,
  driverId,
  documents,
  dates,
  canManage,
  warn,
  today,
}: {
  /** For links that jump here. */
  id?: string
  organizationId: string
  driverId: string
  documents: DriverDocument[]
  /** CDL and medical card files show the driver's own dates. */
  dates: Dates
  canManage: boolean
  /** Inactive drivers aren't driving, so their dates don't need warnings. */
  warn: boolean
  /** "YYYY-MM-DD" */
  today: string
}) {
  const [pending, start] = useTransition()
  const [adding, setAdding] = useState(false)
  // The open dialog keeps its kind while it animates closed.
  const [dialogKind, setDialogKind] = useState<DriverDocumentKind>("cdl")
  const [dialogKey, setDialogKey] = useState(0)
  const missing = ESSENTIALS.filter(
    (kind) => !documents.some((doc) => doc.kind === kind)
  )

  function add(kind: DriverDocumentKind) {
    setDialogKind(kind)
    // A fresh form each time it opens.
    setDialogKey((key) => key + 1)
    setAdding(true)
  }

  return (
    <SettingsCard
      id={id}
      className="scroll-mt-6"
      title="Documents"
      description={
        documents.length
          ? `${documents.length} on file. Kept private to your organization.`
          : "Kept private to your organization."
      }
      action={
        canManage && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => add(missing[0] ?? "mvr")}
          >
            <Plus />
            Add document
          </Button>
        )
      }
      contentClassName="px-0 pb-0"
    >
      <ul className="divide-y border-t">
        {documents.map((doc) => {
          const label = DRIVER_DOCUMENT_LABELS[doc.kind]
          const dateField = DATED_ON_DRIVER[doc.kind]
          const due = dateField ? dates[dateField] : doc.expires_on
          return (
            <li key={doc.id} className="flex items-center gap-3 px-6 py-3">
              <FileTile pdf={doc.content_type === "application/pdf"} />
              <div className="min-w-0 flex-1">
                {doc.url ? (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium hover:underline"
                  >
                    {doc.title ?? label}
                  </a>
                ) : (
                  <span className="text-sm font-medium">
                    {doc.title ?? label}
                  </span>
                )}
                <p className="truncate text-xs text-muted-foreground">
                  {doc.title && `${label} · `}
                  {doc.file_name} · Added{" "}
                  {formatDate(doc.created_at.slice(0, 10))}
                </p>
              </div>
              <Expires due={due} label={label} warn={warn} today={today} />
              <div className="flex shrink-0 items-center">
                {doc.url && (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${doc.file_name}`}
                    className={buttonVariants({
                      variant: "ghost",
                      size: "icon-sm",
                    })}
                  >
                    <ExternalLink />
                  </a>
                )}
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${doc.file_name}`}
                    disabled={pending}
                    onClick={() => {
                      if (
                        !confirm(
                          `Delete ${doc.file_name}? This can't be undone.`
                        )
                      ) {
                        return
                      }
                      start(async () => {
                        const result = await removeDriverDocument(
                          organizationId,
                          driverId,
                          doc.id
                        )
                        if ("error" in result) toast.error(result.error)
                        else toast.success("Deleted.")
                      })
                    }}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </li>
          )
        })}
        {missing.map((kind) => (
          <li key={kind} className="flex items-center gap-3 px-6 py-3">
            <FileTile empty />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-muted-foreground">
                {DRIVER_DOCUMENT_LABELS[kind]}
              </p>
              <p className="text-xs text-muted-foreground">Not uploaded yet</p>
            </div>
            {canManage ? (
              <Button variant="outline" size="sm" onClick={() => add(kind)}>
                <Upload />
                Upload
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Not on file</span>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <AddDocumentDialog
          key={dialogKey}
          organizationId={organizationId}
          driverId={driverId}
          open={adding}
          initialKind={dialogKind}
          onOpenChange={(open) => {
            if (!open) setAdding(false)
          }}
        />
      )}
    </SettingsCard>
  )
}
