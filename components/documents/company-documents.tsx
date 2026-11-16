"use client"

import { FileText, Loader2, Trash2, Upload } from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  addCompanyDocument,
  removeCompanyDocument,
} from "@/app/org/[slug]/documents/actions"
import { ExpiryDate } from "@/components/drivers/driver-badges"
import {
  SettingsCard,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
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
import {
  COMPANY_DOCUMENT_KINDS,
  COMPANY_DOCUMENT_LABELS,
  type CompanyDocumentKind,
} from "@/lib/company-document-format"
import type { CompanyDocument } from "@/lib/documents"
import { expiry } from "@/lib/driver-format"
import { removeLoadFiles, uploadLoadFile } from "@/lib/load-document-upload"

const TABLE =
  "[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6"

function UploadForm({ organizationId }: { organizationId: string }) {
  const [kind, setKind] = useState<CompanyDocumentKind>("insurance")
  const [title, setTitle] = useState("")
  const [expiresOn, setExpiresOn] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [pending, start] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <form
      className="grid gap-4 border-t px-6 py-5 sm:grid-cols-2 2xl:grid-cols-[1fr_1fr_10rem_1fr_auto] 2xl:items-end"
      onSubmit={(event) => {
        event.preventDefault()
        if (!file) return
        start(async () => {
          // Files sit in the company folder of the organization's bucket.
          const uploaded = await uploadLoadFile(
            organizationId,
            "company",
            kind,
            file
          )
          if ("error" in uploaded) {
            toast.error(uploaded.error)
            return
          }
          const result = await addCompanyDocument(organizationId, {
            kind,
            title,
            expires_on: expiresOn,
            path: uploaded.path,
            file_name: uploaded.name,
            content_type: uploaded.type,
            size_bytes: uploaded.size,
          })
          if ("error" in result) {
            await removeLoadFiles([uploaded.path])
            toast.error(result.error)
            return
          }
          toast.success(`${COMPANY_DOCUMENT_LABELS[kind]} added.`)
          setTitle("")
          setExpiresOn("")
          setFile(null)
          if (fileRef.current) fileRef.current.value = ""
        })
      }}
    >
      <Field>
        <FieldLabel htmlFor="company-doc-kind">Type</FieldLabel>
        <Select
          value={kind}
          onValueChange={(value) =>
            setKind((value as CompanyDocumentKind) ?? "insurance")
          }
          items={COMPANY_DOCUMENT_KINDS.map((value) => ({
            value,
            label: COMPANY_DOCUMENT_LABELS[value],
          }))}
        >
          <SelectTrigger id="company-doc-kind" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPANY_DOCUMENT_KINDS.map((value) => (
              <SelectItem key={value} value={value}>
                {COMPANY_DOCUMENT_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="company-doc-title">
          Name {kind !== "other" && "(optional)"}
        </FieldLabel>
        <Input
          id="company-doc-title"
          placeholder={kind === "other" ? "What it is" : "e.g. Cargo policy"}
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="company-doc-expires">Expires</FieldLabel>
        <Input
          id="company-doc-expires"
          type="date"
          value={expiresOn}
          onChange={(event) => setExpiresOn(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="company-doc-file">File</FieldLabel>
        <Input
          id="company-doc-file"
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic,application/pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </Field>
      <Button
        type="submit"
        disabled={pending || !file || (kind === "other" && !title.trim())}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Upload />}
        Upload
      </Button>
    </form>
  )
}

/** The company's own papers, with when each runs out. */
export function CompanyDocuments({
  organizationId,
  documents,
  today,
}: {
  organizationId: string
  documents: CompanyDocument[]
  /** "YYYY-MM-DD" */
  today: string
}) {
  const [pending, start] = useTransition()

  return (
    <SettingsCard
      title="Company documents"
      description="Authority, insurance, W-9 and other papers brokers and shippers ask for. Expiration dates show up on the dashboard when they get close."
      contentClassName="px-0 pb-0"
    >
      {documents.length === 0 ? (
        <div className="px-6 pb-5">
          <SettingsEmptyState icon={FileText} title="No company documents yet">
            Upload your insurance certificate, authority letter and W-9 so
            they&apos;re one click away when a broker asks.
          </SettingsEmptyState>
        </div>
      ) : (
        <Table className={TABLE}>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="w-full">Document</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="max-w-0">
                  {doc.url ? (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:underline"
                    >
                      {doc.title ?? COMPANY_DOCUMENT_LABELS[doc.kind]}
                    </a>
                  ) : (
                    <span className="font-medium">
                      {doc.title ?? COMPANY_DOCUMENT_LABELS[doc.kind]}
                    </span>
                  )}
                  <p className="truncate text-xs text-muted-foreground">
                    {doc.title && `${COMPANY_DOCUMENT_LABELS[doc.kind]} · `}
                    {doc.file_name}
                  </p>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <ExpiryDate
                    item={{
                      key: doc.id,
                      label: COMPANY_DOCUMENT_LABELS[doc.kind],
                      kind: "expires",
                      due: doc.expires_on,
                      expiry: expiry(doc.expires_on, today),
                    }}
                  />
                </TableCell>
                <TableCell>
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
                        const result = await removeCompanyDocument(
                          organizationId,
                          doc.id
                        )
                        if ("error" in result) toast.error(result.error)
                        else toast.success("Deleted.")
                      })
                    }}
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <UploadForm organizationId={organizationId} />
    </SettingsCard>
  )
}
