"use client"

import { cn } from "cn"
import {
  ExternalLink,
  FileText,
  FolderOpen,
  ImageIcon,
  Loader2,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Upload,
} from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { ExpiryBadge } from "@/components/drivers/driver-badges"
import { LocalDate } from "@/components/local-date"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DatePicker } from "@/components/ui/date-picker"
import { FILE_TYPES, driverFileError } from "@/lib/driver-document-upload"
import { expiry, formatDate, needsAction } from "@/lib/driver-format"

/** One file on a driver or truck, as the card shows it. */
export type DocumentRow<K extends string> = {
  id: string
  kind: K
  title: string | null
  expires_on: string | null
  file_name: string
  content_type: string
  created_at: string
  /** A link that works for an hour, or null. */
  url: string | null
}

export type DocumentUpload<K extends string> = {
  kind: K
  title: string
  expires_on: string
  file: File
}

/** What the card needs to know about one kind of owner's documents. */
type Kinds<K extends string> = {
  /** What Add document offers, in order. */
  addable: readonly K[]
  labels: Record<K, string>
  /** Where a kind's date is set instead, when it isn't asked on upload. */
  datedElsewhere: Partial<Record<K, string>>
  /** A different label for the date asked on upload, by kind. */
  dateLabels?: Partial<Record<K, string>>
  /** Kinds whose date is when the next one is due, not when this expires. */
  dueKinds?: readonly K[]
}

/** Documents shown at a time. */
const PAGE_SIZE = 5

/** "1–5 of 12", or "6 of 6" when a page has one document. */
const range = (first: number, last: number, total: number) =>
  `${first === last ? first : `${first}–${last}`} of ${total}`

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
function AddDocumentDialog<K extends string>({
  kinds,
  upload,
  open,
  initialKind,
  onOpenChange,
}: {
  kinds: Kinds<K>
  upload: (input: DocumentUpload<K>) => Promise<string | null>
  open: boolean
  initialKind: K
  onOpenChange: (open: boolean) => void
}) {
  const [kind, setKind] = useState<K>(initialKind)
  const [title, setTitle] = useState("")
  const [expiresOn, setExpiresOn] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [pending, start] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  // Some dates are kept elsewhere, so they aren't asked here.
  const datedElsewhere = kinds.datedElsewhere[kind]

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
          id="document-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!file) return
            start(async () => {
              const error = await upload({
                kind,
                title,
                expires_on: datedElsewhere ? "" : expiresOn,
                file,
              })
              if (error) {
                toast.error(error)
                return
              }
              toast.success(`${kinds.labels[kind]} added.`)
              onOpenChange(false)
            })
          }}
        >
          <Field>
            <FieldLabel htmlFor="doc-kind">Type</FieldLabel>
            <Select
              value={kind}
              onValueChange={(value) => setKind((value as K) ?? initialKind)}
              items={kinds.addable.map((value) => ({
                value,
                label: kinds.labels[value],
              }))}
            >
              <SelectTrigger id="doc-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kinds.addable.map((value) => (
                  <SelectItem key={value} value={value}>
                    {kinds.labels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="doc-expires">
              {kinds.dateLabels?.[kind] ?? "Expires"}
            </FieldLabel>
            {datedElsewhere ? (
              <FieldDescription className="pt-1.5">
                {datedElsewhere}
              </FieldDescription>
            ) : (
              <DatePicker
                id="doc-expires"
                value={expiresOn}
                onChange={setExpiresOn}
                label="Expires"
              />
            )}
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="doc-title">
              Name {kind !== "other" && "(optional)"}
            </FieldLabel>
            <Input
              id="doc-title"
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
            htmlFor="doc-file"
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
              id="doc-file"
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
            form="document-form"
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
  nextDue = false,
}: {
  due: string | null
  label: string
  warn: boolean
  today: string
  /** The date is when the next one is due (an inspection), not an expiry. */
  nextDue?: boolean
}) {
  if (!due) return null
  const state = expiry(due, today)
  if (warn && needsAction(state.state)) {
    return (
      <ExpiryBadge
        item={{
          key: label,
          label,
          kind: nextDue ? "due" : "expires",
          due,
          expiry: state,
        }}
      />
    )
  }
  return (
    <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
      {nextDue ? "Due" : "Expires"} {formatDate(due)}
    </span>
  )
}

/**
 * A driver's or truck's papers as a table: what each is, when it runs out
 * and a link to open it, with Add document and delete.
 */
export function DocumentsCard<K extends string>({
  id,
  documents,
  kinds,
  defaultKind,
  dueFor,
  upload,
  remove: removeDocument,
  canManage,
  warn,
  today,
  emptyText,
  noteFor,
}: {
  /** For links that jump here. */
  id?: string
  documents: DocumentRow<K>[]
  kinds: Kinds<K>
  /** The kind Add document starts on. */
  defaultKind: K
  /** When a document runs out: its own date, or one kept elsewhere. */
  dueFor: (doc: DocumentRow<K>) => string | null
  upload: (input: DocumentUpload<K>) => Promise<string | null>
  remove: (id: string) => Promise<{ error: string } | { ok: true }>
  canManage: boolean
  /** Inactive drivers and parked trucks don't need warnings. */
  warn: boolean
  /** "YYYY-MM-DD" */
  today: string
  /** The empty state's text for owners and admins. */
  emptyText: string
  /** A short line under a document's file name, e.g. where it belongs now. */
  noteFor?: (doc: DocumentRow<K>) => string | null
}) {
  const [pending, start] = useTransition()
  const [adding, setAdding] = useState(false)
  // The open dialog keeps its kind while it animates closed.
  const [dialogKind, setDialogKind] = useState<K>(defaultKind)
  const [dialogKey, setDialogKey] = useState(0)
  // The document waiting on the delete confirmation, if any.
  const [deleting, setDeleting] = useState<DocumentRow<K> | null>(null)
  // Five documents a page. Deleting the last one on a page steps back.
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(documents.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const shown = documents.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  function remove() {
    if (!deleting) return
    const doc = deleting
    start(async () => {
      const result = await removeDocument(doc.id)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Deleted.")
      setDeleting(null)
    })
  }

  function add(kind: K) {
    setDialogKind(kind)
    // A fresh form each time it opens.
    setDialogKey((key) => key + 1)
    setAdding(true)
  }

  return (
    <SettingsCard
      id={id}
      // Columns appear as the card gets wider, not the window.
      className="@container scroll-mt-6"
      title="Documents"
      description={"Kept private to your organization."}
      action={
        canManage && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => add(defaultKind)}
          >
            <Plus />
            Add document
          </Button>
        )
      }
      contentClassName={documents.length ? "px-0 pb-0" : undefined}
      // The page footer shows whenever there's a document; with one page its
      // buttons are just disabled.
      footer={
        documents.length > 0 && (
          <SettingsCardFooter
            hint={range(
              current * PAGE_SIZE + 1,
              current * PAGE_SIZE + shown.length,
              documents.length
            )}
          >
            <Button
              variant="outline"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={current === pages - 1}
              onClick={() => setPage(current + 1)}
            >
              Next
              <ChevronRight />
            </Button>
          </SettingsCardFooter>
        )
      }
    >
      {documents.length === 0 ? (
        <SettingsEmptyState icon={FolderOpen} title="No documents yet">
          {canManage ? emptyText : "Owners and admins add documents here."}
        </SettingsEmptyState>
      ) : (
        <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
          <TableHeader className="bg-muted/40">
            <TableRow>
              {/* Document takes the spare width; the rest fit their contents. */}
              <TableHead className="w-full">Document</TableHead>
              <TableHead className="hidden w-px whitespace-nowrap @lg:table-cell">
                Type
              </TableHead>
              <TableHead className="w-px whitespace-nowrap">
                {kinds.dueKinds?.length ? "Expires or due" : "Expires"}
              </TableHead>
              <TableHead className="hidden w-px @xl:table-cell">
                Added
              </TableHead>
              <TableHead className="w-px">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((doc) => {
              const label = kinds.labels[doc.kind]
              const due = dueFor(doc)
              const pdf = doc.content_type === "application/pdf"
              return (
                <TableRow key={doc.id}>
                  <TableCell className="max-w-0 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-md",
                          pdf
                            ? "bg-red-500/10 text-red-700"
                            : "bg-sky-500/10 text-sky-700"
                        )}
                      >
                        {pdf ? (
                          <FileText className="size-4" />
                        ) : (
                          <ImageIcon className="size-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <a
                          href={doc.url ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm font-medium hover:underline"
                        >
                          {doc.title ?? label}
                        </a>
                        <p className="truncate text-xs text-muted-foreground">
                          {doc.file_name}
                        </p>
                        {noteFor?.(doc) && (
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            {noteFor(doc)}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm whitespace-nowrap text-muted-foreground @lg:table-cell">
                    {label}
                  </TableCell>
                  <TableCell>
                    {due ? (
                      <Expires
                        due={due}
                        label={label}
                        warn={warn}
                        today={today}
                        nextDue={kinds.dueKinds?.includes(doc.kind)}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-xs whitespace-nowrap text-muted-foreground @xl:table-cell">
                    <LocalDate value={doc.created_at} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
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
                          className="hover:text-destructive"
                          aria-label={`Delete ${doc.file_name}`}
                          disabled={pending}
                          onClick={() => setDeleting(doc)}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
      {canManage && (
        <AddDocumentDialog
          key={dialogKey}
          kinds={kinds}
          upload={upload}
          open={adding}
          initialKind={dialogKind}
          onOpenChange={(open) => {
            if (!open) setAdding(false)
          }}
        />
      )}
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !pending && !open && setDeleting(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this document?</DialogTitle>
            <DialogDescription>
              {deleting
                ? `${deleting.title ?? kinds.labels[deleting.kind]} (${deleting.file_name}) will be deleted. This can't be undone.`
                : "This can't be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={remove}>
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  )
}
