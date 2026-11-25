import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import sharp from "sharp"

import {
  AUDIT_READY,
  DQ_STATUS_LABELS,
  EXPORT_DISCLAIMER,
} from "@/lib/dq-format"
import { auditExportPdf, type ExportFile, type ExportRow } from "@/lib/dq-pdf"
import { dateOf } from "@/lib/dq-rules"
import { listChecklist, type Result } from "@/lib/dq/service"
import { DQ_FILE_LABELS, dqFileTypeSchema } from "@/lib/schemas/dq"

const BUCKET = "dq-files"

const METHOD_LABELS: Record<string, string> = {
  phone: "Phone",
  email: "Email",
  fax: "Fax",
  mail: "Mail",
  in_person: "In person",
  other: "Other",
}

const OUTCOME_LABELS: Record<string, string> = {
  no_previous_employers:
    "No previous DOT-regulated employers in the past 3 years",
  response_received: "Response received",
  no_response: "No response",
  declined: "Declined to answer",
  no_record_of_driver: "No record of the driver",
  attempt_failed: "Attempt failed",
}

/** WebP photos can't go in a PDF as is; JPEG can. */
async function forPdf(bytes: Uint8Array, contentType: string) {
  if (contentType !== "image/webp") return { bytes, contentType }
  const jpeg = await sharp(bytes).jpeg({ quality: 85 }).toBuffer()
  return { bytes: new Uint8Array(jpeg), contentType: "image/jpeg" }
}

/**
 * One driver's file as a single PDF: the cover sheet (each item, its rule,
 * date and status) and then the confirmed documents and signed records in
 * checklist order, earlier cycles included. The standard DQ file never
 * includes the restricted files; those export on their own, for owners and
 * admins only (row-level security leaves them out for anyone else).
 */
export async function exportFile(
  supabase: SupabaseClient,
  driverId: string,
  fileParam: string | null,
  today: string
): Promise<Result<{ pdf: Uint8Array; fileName: string }>> {
  const file = dqFileTypeSchema.safeParse(fileParam ?? "dq")
  if (!file.success) {
    return { ok: false, status: 400, error: "Choose which file to export." }
  }
  const fileType = file.data

  const { data: driverData } = await supabase
    .from("drivers")
    .select("full_name, organization_id")
    .eq("id", driverId)
    .maybeSingle()
  const driver = driverData as {
    full_name: string
    organization_id: string
  } | null
  if (!driver) {
    return {
      ok: false,
      status: 404,
      error: "That driver isn't in a file you can see.",
    }
  }
  if (fileType !== "dq") {
    const { data: manager } = await supabase.rpc("can_manage_dq", {
      org_id: driver.organization_id,
    })
    if (manager !== true) {
      return {
        ok: false,
        status: 403,
        error: "Only owners and admins can export this file.",
      }
    }
  }

  const checklist = await listChecklist(supabase, driverId, today)
  if (!checklist.ok) return checklist
  const items = checklist.data.items.filter(
    (item) => item.file_type === fileType
  )

  const rows: ExportRow[] = items.map((item) => {
    const confirmed = item.documents.find((d) => d.confirmed && !d.superseded)
    const date = item.completed_at
      ? (confirmed?.issue_date ?? dateOf(item.completed_at))
      : item.due_date
        ? `Due ${item.due_date}`
        : "-"
    const label = [
      item.title,
      item.license_state ? `(${item.license_state})` : "",
      item.cycle_number > 1 ? `- cycle ${item.cycle_number}` : "",
    ]
      .filter(Boolean)
      .join(" ")
    return {
      title: label,
      cfrRef: item.cfr_ref,
      date,
      status: DQ_STATUS_LABELS[item.status],
    }
  })

  // Confirmed documents and signed records, in checklist order.
  const wanted: { label: string; path: string; contentType: string }[] = []
  for (const item of items) {
    const { data: docs } = await supabase
      .from("dq_documents")
      .select("storage_path, content_type, file_name")
      .eq("dq_item_id", item.id)
      .not("confirmed_at", "is", null)
      .is("superseded_at", null)
    for (const doc of (docs ?? []) as {
      storage_path: string
      content_type: string
      file_name: string
    }[]) {
      wanted.push({
        label: `${item.title}: ${doc.file_name}`,
        path: doc.storage_path,
        contentType: doc.content_type,
      })
    }
    const { data: signed } = await supabase
      .from("dq_attestations")
      .select("pdf_path")
      .eq("dq_item_id", item.id)
      .not("pdf_path", "is", null)
      .is("voided_at", null)
    for (const record of (signed ?? []) as { pdf_path: string }[]) {
      wanted.push({
        label: `${item.title}: signed record`,
        path: record.pdf_path,
        contentType: "application/pdf",
      })
    }
  }

  const files: ExportFile[] = []
  for (const entry of wanted) {
    const { data } = await supabase.storage.from(BUCKET).download(entry.path)
    if (!data) continue
    const converted = await forPdf(
      new Uint8Array(await data.arrayBuffer()),
      entry.contentType
    )
    files.push({ label: entry.label, ...converted })
  }

  // The investigation file's contact log goes on its own page.
  const sections: { heading: string; lines: string[] }[] = []
  if (fileType === "investigation") {
    const { data } = await supabase
      .from("dq_employer_checks")
      .select(
        "employer_name, employer_address, contacted_at, method, outcome, response_summary"
      )
      .eq("driver_id", driverId)
      .is("removed_at", null)
      .order("contacted_at")
    const contacts = (data ?? []) as {
      employer_name: string | null
      employer_address: string | null
      contacted_at: string
      method: string | null
      outcome: string
      response_summary: string | null
    }[]
    sections.push({
      heading: "Previous-employer contacts",
      lines: contacts.length
        ? contacts.map((c) =>
            c.employer_name === null
              ? `${dateOf(c.contacted_at)}  ${OUTCOME_LABELS[c.outcome] ?? c.outcome}.${c.response_summary ? ` ${c.response_summary}` : ""}`
              : `${dateOf(c.contacted_at)}  ${c.employer_name}${c.employer_address ? `, ${c.employer_address}` : ""}. ${(c.method && METHOD_LABELS[c.method]) ?? c.method}: ${OUTCOME_LABELS[c.outcome] ?? c.outcome}.${c.response_summary ? ` ${c.response_summary}` : ""}`
          )
        : ["No contacts logged."],
    })
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", driver.organization_id)
    .maybeSingle()

  const status = checklist.data.status
  const statusLine =
    fileType !== "dq"
      ? "Restricted file"
      : status.status === "audit_ready"
        ? AUDIT_READY
        : status.status === "no_checklist"
          ? "No checklist yet: add the driver's start date and license"
          : `Not audit-ready: ${status.missing} missing, ${status.overdue} overdue, ${status.pendingReview} waiting for review`

  const pdf = await auditExportPdf({
    organizationName: (org as { name: string } | null)?.name ?? "",
    driverName: driver.full_name,
    fileLabel: DQ_FILE_LABELS[fileType],
    statusLine,
    generatedAt: new Date().toISOString(),
    rows,
    files,
    sections,
    footer: EXPORT_DISCLAIMER,
  })
  const slug = driver.full_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return {
    ok: true,
    data: {
      pdf,
      fileName: `${slug || "driver"}-${fileType.replace("_", "-")}-file-${today}.pdf`,
    },
  }
}
