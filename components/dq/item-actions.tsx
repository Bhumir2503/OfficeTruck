"use client"

import {
  CheckCheck,
  FileSearch,
  FileText,
  Pencil,
  PenLine,
  Sparkles,
  Upload,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { dqFetch } from "@/components/dq/dq-api"
import { DQ_ACCEPT, uploadDqFile } from "@/components/dq/dq-upload"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Textarea } from "@/components/ui/textarea"
import type { ChecklistDocument, ChecklistEntry } from "@/lib/dq/service"

/** What an item's rule asks for when it's completed. */
export type ItemRules = {
  /** Medical proof: the printed expiry date is required. */
  needsExpiry: boolean
  /** Clearinghouse queries: what the query showed. */
  needsQueryResult: boolean
}

type Props = {
  item: ChecklistEntry
  rules: ItemRules
  driverName: string
  /** The signed-in person's name, to prefill signatures. */
  signerName: string
}

function useAction() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  async function run<T>(
    call: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    success: string | ((data: T) => string)
  ) {
    setPending(true)
    const result = await call()
    setPending(false)
    if (!result.ok) {
      toast.error(result.error)
      return false
    }
    toast.success(typeof success === "string" ? success : success(result.data))
    router.refresh()
    return true
  }
  return { pending, run }
}

/** What the AI read, as text, for the review dialog. */
function suggestion(document: ChecklistDocument) {
  const read = document.ai_extraction
  if (!read) return null
  const text = (key: string) =>
    typeof read[key] === "string" ? (read[key] as string) : null
  return {
    issue: text("issue_date"),
    expiry: text("expiry_date"),
    name: text("driver_name"),
    state: text("license_state"),
  }
}

function ReviewDialog({
  item,
  document,
  rules,
  open,
  onOpenChange,
}: {
  item: ChecklistEntry
  document: ChecklistDocument
  rules: ItemRules
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { pending, run } = useAction()
  // Editing a confirmed document starts from what was confirmed; reviewing
  // a new one starts from what the AI read, if anything.
  const editing = document.confirmed
  const read = editing ? null : suggestion(document)
  const [issue, setIssue] = useState(
    (editing ? document.issue_date : read?.issue) ?? ""
  )
  const [expiry, setExpiry] = useState(
    (editing ? document.expiry_date : read?.expiry) ?? ""
  )
  const [result, setResult] = useState<"" | "no_record" | "record_found">(
    (editing ? item.query_result : null) ?? ""
  )

  async function confirm(event: React.FormEvent) {
    event.preventDefault()
    const done = await run(
      () =>
        dqFetch<{ added: number }>(`documents/${document.id}/confirm`, {
          json: {
            issue_date: issue,
            expiry_date: expiry || null,
            query_result: result || null,
          },
        }),
      (data) =>
        editing
          ? `${item.title} updated.`
          : data.added
            ? `${item.title} confirmed. ${data.added} follow-up ${data.added === 1 ? "item" : "items"} added.`
            : `${item.title} confirmed.`
    )
    if (done) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit" : "Review"} {item.title.toLowerCase()}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Fix anything that was entered wrong. The next due date follows the change, and the old values stay in the file's history."
              : "Check the dates against the document. Nothing counts until you confirm it."}
          </DialogDescription>
        </DialogHeader>
        <form
          id={`review-${document.id}`}
          onSubmit={confirm}
          className="grid gap-4"
        >
          {document.url && (
            <a
              href={document.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
            >
              <FileSearch className="size-4" /> Open {document.file_name}
            </a>
          )}
          {read && (
            <p className="flex gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-sm text-sky-900">
              <Sparkles className="mt-0.5 size-4 shrink-0" />
              <span>
                Suggested from the document
                {read.name ? `, for ${read.name}` : ""}
                {read.state ? ` (${read.state})` : ""}. The dates below are
                filled in from it; correct anything that&apos;s wrong.
              </span>
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`issue-${document.id}`}>
                Date on the document
              </FieldLabel>
              <Input
                id={`issue-${document.id}`}
                type="date"
                required
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
              />
              <FieldDescription>
                When it was issued, run or signed.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`expiry-${document.id}`}>
                Expires{rules.needsExpiry ? "" : " (if it does)"}
              </FieldLabel>
              <Input
                id={`expiry-${document.id}`}
                type="date"
                required={rules.needsExpiry}
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
              {rules.needsExpiry && (
                <FieldDescription>
                  The date printed on it. Often 12 months or less.
                </FieldDescription>
              )}
            </Field>
          </div>
          {rules.needsQueryResult && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">
                What did the query show?
              </legend>
              {(
                [
                  ["no_record", "No record found"],
                  [
                    "record_found",
                    "A record exists (a full query is due within 24 hours)",
                  ],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="query_result"
                    value={value}
                    required
                    checked={result === value}
                    onChange={() => setResult(value)}
                    className="accent-brand"
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
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
            form={`review-${document.id}`}
            disabled={pending}
          >
            {pending ? "Saving…" : editing ? "Save changes" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SignDialog({
  item,
  driverName,
  signerName,
  open,
  onOpenChange,
}: Omit<Props, "rules"> & {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { pending, run } = useAction()
  const registry = item.template_code === "registry_verification"
  const [name, setName] = useState(signerName)
  const [agree, setAgree] = useState(false)
  const [examiner, setExaminer] = useState("")
  const [number, setNumber] = useState("")
  const [verifiedOn, setVerifiedOn] = useState("")

  async function sign(event: React.FormEvent) {
    event.preventDefault()
    const done = await run(
      () =>
        dqFetch<{ id: string }>(`items/${item.id}/sign`, {
          json: registry
            ? {
                signer_name: name,
                agree,
                examiner_name: examiner,
                registry_number: number,
                verified_on: verifiedOn,
              }
            : { signer_name: name, agree },
        }),
      "Signed. The PDF is in the file."
    )
    if (done) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {registry ? "Sign the registry note" : "Sign the annual review"}
          </DialogTitle>
          <DialogDescription>
            {registry
              ? `Record that you checked ${driverName}'s medical examiner on the FMCSA National Registry.`
              : `Record that you reviewed ${driverName}'s driving record for this year.`}
          </DialogDescription>
        </DialogHeader>
        <form id={`sign-${item.id}`} onSubmit={sign} className="grid gap-4">
          {registry && (
            <>
              <Field>
                <FieldLabel htmlFor={`examiner-${item.id}`}>
                  Medical examiner
                </FieldLabel>
                <Input
                  id={`examiner-${item.id}`}
                  required
                  value={examiner}
                  onChange={(e) => setExaminer(e.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`number-${item.id}`}>
                    Registry number
                  </FieldLabel>
                  <Input
                    id={`number-${item.id}`}
                    required
                    inputMode="numeric"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`verified-${item.id}`}>
                    Checked on
                  </FieldLabel>
                  <Input
                    id={`verified-${item.id}`}
                    type="date"
                    required
                    value={verifiedOn}
                    onChange={(e) => setVerifiedOn(e.target.value)}
                  />
                </Field>
              </div>
            </>
          )}
          <Field>
            <FieldLabel htmlFor={`signer-${item.id}`}>
              Your full name
            </FieldLabel>
            <Input
              id={`signer-${item.id}`}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={agree}
              onCheckedChange={(value) => setAgree(value === true)}
              className="mt-0.5"
            />
            <span>
              I&apos;m signing this record electronically. It&apos;s saved as a
              PDF with my name and the time.
            </span>
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
            form={`sign-${item.id}`}
            disabled={pending || !agree}
          >
            <PenLine /> {pending ? "Signing…" : "Sign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Voids a signed office note that has a mistake, with the reason, so it can
 * be signed again. The note stays in the file's history, marked void.
 */
export function VoidSignatureButton({
  signatureId,
  label,
}: {
  signatureId: string
  /** What's being voided, e.g. "the annual review note". */
  label: string
}) {
  const { pending, run } = useAction()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const done = await run(
      () =>
        dqFetch<{ reopened: boolean }>(`signatures/${signatureId}/void`, {
          json: { reason },
        }),
      (data) =>
        data.reopened ? "Voided. Sign it again when it's fixed." : "Voided."
    )
    if (done) setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground hover:text-destructive hover:underline"
      >
        Void
      </button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Void {label}?</DialogTitle>
            <DialogDescription>
              A signed note can&apos;t be edited. Voiding it keeps it in the
              file&apos;s history, marked void, so you can sign a corrected one.
            </DialogDescription>
          </DialogHeader>
          <form id={`void-${signatureId}`} onSubmit={save}>
            <Field>
              <FieldLabel htmlFor={`void-reason-${signatureId}`}>
                What was wrong
              </FieldLabel>
              <Textarea
                id={`void-reason-${signatureId}`}
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Wrong registry number"
              />
            </Field>
          </form>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              form={`void-${signatureId}`}
              disabled={pending || reason.trim().length < 3}
            >
              {pending ? "Voiding…" : "Void"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** The buttons for one checklist item, for owners and admins. */
export function ItemActions({ item, rules, driverName, signerName }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const { pending, run } = useAction()
  const [review, setReview] = useState<ChecklistDocument | null>(null)
  const [signing, setSigning] = useState(false)
  // The file being sent, so its name shows right away.
  const [sending, setSending] = useState<string | null>(null)

  if (!item.current || item.not_applicable_reason) return null
  const open = !item.completed_at
  const waiting = item.documents.filter((d) => !d.confirmed && !d.superseded)
  const signable =
    open &&
    (item.template_code === "annual_review" ||
      item.template_code === "registry_verification")
  const completable =
    open &&
    (item.evidence === "contact_log" ||
      (item.template_code === "employment_application" &&
        item.signatures.length > 0))

  // The newest file on the item stands in for the Upload button.
  const latest = item.documents.find((d) => !d.superseded) ?? null
  // What counts now, so a mistake in it can be fixed after completion.
  const confirmed =
    item.documents.find((d) => d.confirmed && !d.superseded) ?? null

  async function upload(file: File) {
    setSending(file.name)
    await run(
      () => uploadDqFile(item.id, file),
      (data) =>
        data.ai_extraction
          ? "Uploaded. Check the suggested dates, then confirm."
          : "Uploaded. Review it to confirm."
    )
    setSending(null)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {waiting.map((document) => (
        <Button key={document.id} size="sm" onClick={() => setReview(document)}>
          <FileSearch /> Review
        </Button>
      ))}
      {signable && (
        <Button
          size="sm"
          variant={waiting.length ? "outline" : "default"}
          onClick={() => setSigning(true)}
        >
          <PenLine /> Sign
        </Button>
      )}
      {completable && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => dqFetch(`items/${item.id}/complete`, { method: "POST" }),
              `${item.title} complete.`
            )
          }
        >
          <CheckCheck />{" "}
          {item.evidence === "contact_log" ? "Mark checks done" : "Approve"}
        </Button>
      )}
      {confirmed && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setReview(confirmed)}
        >
          <Pencil /> Edit
        </Button>
      )}
      {item.evidence !== "contact_log" && (open || latest) && (
        <>
          {sending || !latest ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              className="max-w-56"
              onClick={() => fileInput.current?.click()}
            >
              <Upload />
              <span className="truncate">{sending ?? "Upload"}</span>
            </Button>
          ) : (
            <span className="inline-flex max-w-64 items-center rounded-md border">
              <a
                href={latest.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                title={`Open ${latest.file_name}`}
                className="inline-flex h-8 min-w-0 items-center gap-1.5 px-2.5 text-sm font-medium text-brand hover:underline"
              >
                <FileText className="size-4 shrink-0" />
                <span className="truncate">{latest.file_name}</span>
              </a>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Replace file"
                title="Replace file"
                disabled={pending}
                className="rounded-l-none border-l"
                onClick={() => fileInput.current?.click()}
              >
                <Upload />
              </Button>
            </span>
          )}
          <input
            ref={fileInput}
            type="file"
            accept={DQ_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) void upload(file)
            }}
          />
        </>
      )}
      {review && (
        <ReviewDialog
          key={review.id}
          item={item}
          document={review}
          rules={rules}
          open
          onOpenChange={(next) => !next && setReview(null)}
        />
      )}
      {signing && (
        <SignDialog
          item={item}
          driverName={driverName}
          signerName={signerName}
          open
          onOpenChange={setSigning}
        />
      )}
    </div>
  )
}
