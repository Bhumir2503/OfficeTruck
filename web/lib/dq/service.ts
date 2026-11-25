import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { randomUUID } from "node:crypto"

import { keyringFromEnv, sealDateOfBirth, sealSsn } from "@/lib/dq-crypto"
import {
  annualReviewStatement,
  applicationStatement,
  EXPORT_DISCLAIMER,
  registryStatement,
} from "@/lib/dq-format"
import { applicationPdf, signedNotePdf, type Signature } from "@/lib/dq-pdf"
import {
  buildChecklist,
  currentItems,
  dateOf,
  driverStatus,
  inEffect,
  itemStatus,
  nextCycle,
  validUntil,
  type DqDriver,
  type DqDriverStatus,
  type DqItemStatus,
  type DqTemplate,
  type PlannedItem,
} from "@/lib/dq-rules"
import { today as getToday } from "@/lib/driver-format"
import { canReadWithAi, readDqDocument } from "@/lib/dq/extract"
import {
  annualReviewSignSchema,
  applicationAnswersSchema,
  applicationDraftSchema,
  applicationSignSchema,
  confirmDocumentSchema,
  DQ_UPLOAD_TYPES,
  employerCheckSchema,
  endDateSchema,
  firstIssue,
  NO_PREVIOUS_EMPLOYERS,
  notApplicableSchema,
  voidSignatureSchema,
  registrySignSchema,
  uploadSchema,
} from "@/lib/schemas/dq"

/*
 * The DQ file operations behind every endpoint. Each takes a Supabase client
 * acting as the signed-in person, so row-level security decides what they
 * can see and change; the checks here give clearer messages. Each input is
 * parsed before anything is read or written. Every insert and update is
 * recorded in dq_audit_log by the database's triggers.
 *
 * Never log or return a Social Security number.
 */

export type Result<T> =
  { ok: true; data: T } | { ok: false; status: number; error: string }

const ok = <T>(data: T): Result<T> => ({ ok: true, data })
const fail = <T>(status: number, error: string): Result<T> => ({
  ok: false,
  status,
  error,
})

const NOT_FOUND = "That isn't in a file you can see."
const MANAGERS_ONLY = "Only owners and admins can do that."
const BUCKET = "dq-files"
const SIGNED_URL_SECONDS = 60 * 60

// ---------------------------------------------------------------- Rows --

type DriverRow = {
  id: string
  organization_id: string
  full_name: string
  license_class: DqDriver["license_class"]
  cdl_state: string | null
  prior_license_states: string[]
  start_date: string | null
  end_date: string | null
  holds_medical_variance: boolean
}

const DRIVER_COLUMNS =
  "id, organization_id, full_name, license_class, cdl_state, prior_license_states, start_date, end_date, holds_medical_variance"

type ItemRow = {
  id: string
  organization_id: string
  driver_id: string
  template_id: string
  template_code: string
  file_type: DqTemplate["file_type"]
  license_state: string | null
  cycle_number: number
  due_date: string | null
  completed_at: string | null
  valid_until: string | null
  query_result: "no_record" | "record_found" | null
  not_applicable_reason: string | null
}

const ITEM_COLUMNS =
  "id, organization_id, driver_id, template_id, template_code, file_type, license_state, cycle_number, due_date, completed_at, valid_until, query_result, not_applicable_reason"

type DocumentRow = {
  id: string
  organization_id: string
  driver_id: string
  dq_item_id: string
  storage_path: string
  source: "upload" | "generated"
  file_name: string
  content_type: (typeof DQ_UPLOAD_TYPES)[number]
  size_bytes: number
  ai_extraction: Record<string, unknown> | null
  issue_date: string | null
  expiry_date: string | null
  confirmed_at: string | null
  superseded_at: string | null
  created_at: string
}

const DOCUMENT_COLUMNS =
  "id, organization_id, driver_id, dq_item_id, storage_path, source, file_name, content_type, size_bytes, ai_extraction, issue_date, expiry_date, confirmed_at, superseded_at, created_at"

type AttestationRow = {
  id: string
  dq_item_id: string
  type: "employment_application" | "annual_review" | "registry_verification"
  signer_name: string
  signer_role: "owner" | "admin" | "driver"
  signed_at: string
  pdf_path: string | null
  voided_at: string | null
  void_reason: string | null
}

const ATTESTATION_COLUMNS =
  "id, dq_item_id, type, signer_name, signer_role, signed_at, pdf_path, voided_at, void_reason"

const toDriver = (row: DriverRow): DqDriver => ({
  license_class: row.license_class,
  license_state: row.cdl_state,
  prior_license_states: row.prior_license_states,
  start_date: row.start_date,
  end_date: row.end_date,
  holds_medical_variance: row.holds_medical_variance,
})

// ----------------------------------------------------------- Lookups --

export async function loadTemplates(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("dq_requirement_templates")
    .select("*")
    .order("sort_order")
  if (error) throw new Error(error.message)
  return data as DqTemplate[]
}

async function loadDriver(supabase: SupabaseClient, driverId: string) {
  const { data } = await supabase
    .from("drivers")
    .select(DRIVER_COLUMNS)
    .eq("id", driverId)
    .maybeSingle()
  return data as DriverRow | null
}

async function loadItem(supabase: SupabaseClient, itemId: string) {
  const { data } = await supabase
    .from("dq_items")
    .select(ITEM_COLUMNS)
    .eq("id", itemId)
    .maybeSingle()
  return data as ItemRow | null
}

async function isManager(supabase: SupabaseClient, organizationId: string) {
  const { data } = await supabase.rpc("can_manage_dq", {
    org_id: organizationId,
  })
  return data === true
}

async function isTheDriver(
  supabase: SupabaseClient,
  organizationId: string,
  driverId: string
) {
  const { data } = await supabase.rpc("is_dq_driver", {
    org_id: organizationId,
    target_driver: driverId,
  })
  return data === true
}

/** Turns a database error into a message, keeping the triggers' wording. */
function dbError<T>(error: { code?: string; message: string }): Result<T> {
  if (error.code === "42501") return fail(403, error.message)
  if (error.code === "23505") return fail(409, "That's already been recorded.")
  if (error.code === "23514" || error.code === "22023")
    return fail(400, error.message)
  return fail(500, "Something went wrong. Try again.")
}

// ---------------------------------------------------------- Checklist --

export type ChecklistDocument = {
  id: string
  file_name: string
  content_type: string
  source: "upload" | "generated"
  issue_date: string | null
  expiry_date: string | null
  confirmed: boolean
  superseded: boolean
  /** What the AI read: a suggestion, never a confirmed value. */
  ai_extraction: Record<string, unknown> | null
  created_at: string
  url: string | null
}

export type ChecklistEntry = {
  id: string
  template_code: string
  title: string
  cfr_ref: string
  evidence: DqTemplate["evidence"]
  file_type: DqTemplate["file_type"]
  license_state: string | null
  cycle_number: number
  /** False for earlier cycles, which are history. */
  current: boolean
  /**
   * The item this one comes round with, the same year (the annual MVR, for
   * the annual review), so it can be shown on that item's row.
   */
  paired_with: string | null
  due_date: string | null
  completed_at: string | null
  valid_until: string | null
  query_result: ItemRow["query_result"]
  not_applicable_reason: string | null
  status: DqItemStatus
  documents: ChecklistDocument[]
  signatures: (Omit<AttestationRow, "pdf_path" | "dq_item_id"> & {
    url: string | null
  })[]
}

export type Checklist = {
  driverId: string
  items: ChecklistEntry[]
  /** Judged on the standard DQ file. */
  status: DqDriverStatus
}

/** Signed URLs for a batch of paths, or null where one can't be made. */
async function signedUrls(supabase: SupabaseClient, paths: string[]) {
  const urls = new Map<string, string>()
  if (!paths.length) return urls
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS)
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
  }
  return urls
}

/**
 * A driver's checklist: every item the signed-in person may see (owners and
 * admins all three files, members and the driver the standard DQ file),
 * each with its status, documents and signatures, in checklist order.
 */
export async function listChecklist(
  supabase: SupabaseClient,
  driverId: string,
  today: string
): Promise<Result<Checklist>> {
  const [items, documents, attestations, templates] = await Promise.all([
    supabase.from("dq_items").select(ITEM_COLUMNS).eq("driver_id", driverId),
    supabase
      .from("dq_documents")
      .select(DOCUMENT_COLUMNS)
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false }),
    supabase
      .from("dq_attestations")
      .select(ATTESTATION_COLUMNS)
      .eq("driver_id", driverId)
      .order("signed_at"),
    loadTemplates(supabase),
  ])
  if (items.error || documents.error || attestations.error) {
    return fail(500, "The checklist couldn't be loaded.")
  }
  const byId = new Map(templates.map((t) => [t.id, t]))
  const documentRows = documents.data as DocumentRow[]
  // Items of a rule that has ended (the non-CDL medical rules, say) and
  // were marked not applicable are history only: left off the checklist.
  // So is a state's driving record once the state was taken off the driver,
  // when nothing was ever filed on it.
  const itemRows = (items.data as ItemRow[]).filter((item) => {
    const template = byId.get(item.template_id)
    const ended =
      item.not_applicable_reason && template && !inEffect(template, today)
    const stateRemoved =
      item.not_applicable_reason === STATE_REMOVED &&
      !item.completed_at &&
      !documentRows.some((d) => d.dq_item_id === item.id && !d.superseded_at)
    return !ended && !stateRemoved
  })
  const attestationRows = attestations.data as AttestationRow[]
  const urls = await signedUrls(supabase, [
    ...documentRows.filter((d) => !d.superseded_at).map((d) => d.storage_path),
    ...attestationRows.flatMap((a) => (a.pdf_path ? [a.pdf_path] : [])),
  ])

  const pending = (item: ItemRow) =>
    !item.completed_at &&
    (documentRows.some(
      (d) => d.dq_item_id === item.id && !d.confirmed_at && !d.superseded_at
    ) ||
      attestationRows.some((a) => a.dq_item_id === item.id && !a.voided_at))

  const current = new Set(
    currentItems(
      itemRows.map((item) => ({ ...item, pending_review: false }))
    ).map((item) => item.id)
  )
  // On the checklist, last year's record stays in view while it's still
  // good and next year's isn't done, so the file shows what's on it now
  // (year 1, good until …) as well as what's next (year 2, due …).
  for (const item of itemRows) {
    if (!item.completed_at || !item.valid_until || item.valid_until < today) {
      continue
    }
    const later = itemRows.filter(
      (other) =>
        other.template_code === item.template_code &&
        other.license_state === item.license_state &&
        other.cycle_number > item.cycle_number
    )
    if (later.length && later.every((other) => !other.completed_at)) {
      current.add(item.id)
    }
  }

  // An item that comes round with a paired one (the annual review with the
  // annual MVR) isn't shown until that year's paired record has a file on
  // it, or is done: there's nothing to review before then. It still counts
  // toward the file's status and reminders.
  const pairOf = (item: ItemRow) => {
    const template = byId.get(item.template_id)
    if (!template?.follows_paired || !template.paired_code) return null
    return (
      itemRows.find(
        (other) =>
          other.template_code === template.paired_code &&
          other.cycle_number === item.cycle_number
      ) ?? null
    )
  }
  const waitingOnPair = (item: ItemRow) => {
    if (item.completed_at || item.not_applicable_reason) return false
    const pair = pairOf(item)
    if (!pair) return false
    return (
      !pair.completed_at &&
      !documentRows.some((d) => d.dq_item_id === pair.id && !d.superseded_at)
    )
  }

  const entries: ChecklistEntry[] = itemRows
    .filter((item) => !waitingOnPair(item))
    .map((item) => {
      const template = byId.get(item.template_id)
      return {
        id: item.id,
        template_code: item.template_code,
        title: template?.title ?? item.template_code,
        cfr_ref: template?.cfr_ref ?? "",
        evidence: template?.evidence ?? "document",
        file_type: item.file_type,
        license_state: item.license_state,
        cycle_number: item.cycle_number,
        current: current.has(item.id),
        due_date: item.due_date,
        completed_at: item.completed_at,
        valid_until: item.valid_until,
        query_result: item.query_result,
        not_applicable_reason: item.not_applicable_reason,
        paired_with: pairOf(item)?.id ?? null,
        status: itemStatus({ ...item, pending_review: pending(item) }, today),
        documents: documentRows
          .filter((d) => d.dq_item_id === item.id)
          .map((d) => ({
            id: d.id,
            file_name: d.file_name,
            content_type: d.content_type,
            source: d.source,
            issue_date: d.issue_date,
            expiry_date: d.expiry_date,
            confirmed: !!d.confirmed_at,
            superseded: !!d.superseded_at,
            ai_extraction: d.ai_extraction,
            created_at: d.created_at,
            url: urls.get(d.storage_path) ?? null,
          })),
        signatures: attestationRows
          .filter((a) => a.dq_item_id === item.id)
          .map((a) => ({
            id: a.id,
            type: a.type,
            signer_name: a.signer_name,
            signer_role: a.signer_role,
            signed_at: a.signed_at,
            voided_at: a.voided_at,
            void_reason: a.void_reason,
            url: a.pdf_path ? (urls.get(a.pdf_path) ?? null) : null,
          })),
        sort: template?.sort_order ?? 0,
      }
    })
    .sort(
      (a, b) =>
        a.sort - b.sort ||
        (a.license_state ?? "").localeCompare(b.license_state ?? "") ||
        a.cycle_number - b.cycle_number
    )
    .map(({ sort, ...entry }) => {
      void sort
      return entry
    })

  const status = driverStatus(
    itemRows
      .filter((item) => item.file_type === "dq")
      .map((item) => ({ ...item, pending_review: pending(item) })),
    today
  )
  return ok({ driverId, items: entries, status })
}

/** Inserts planned items that don't exist yet. Returns how many were added. */
async function insertPlanned(
  supabase: SupabaseClient,
  organizationId: string,
  driverId: string,
  planned: PlannedItem[],
  triggeredBy: string | null = null,
  templates: DqTemplate[] = []
) {
  if (!planned.length) return 0
  const { data: existing } = await supabase
    .from("dq_items")
    .select("template_code, license_state, cycle_number")
    .eq("driver_id", driverId)
  const have = new Set(
    (
      (existing ?? []) as Pick<
        ItemRow,
        "template_code" | "license_state" | "cycle_number"
      >[]
    ).map(
      (i) => `${i.template_code}:${i.license_state ?? ""}:${i.cycle_number}`
    )
  )
  const rows = planned
    .filter(
      (p) =>
        !have.has(
          `${p.template_code}:${p.license_state ?? ""}:${p.cycle_number}`
        )
    )
    .map((p) => ({
      organization_id: organizationId,
      driver_id: driverId,
      template_id: p.template_id,
      license_state: p.license_state,
      cycle_number: p.cycle_number,
      due_date: p.due_date,
      triggered_by_item_id: templates.find((t) => t.id === p.template_id)
        ?.trigger_code
        ? triggeredBy
        : null,
    }))
  if (!rows.length) return 0
  const { error } = await supabase.from("dq_items").insert(rows)
  if (error) throw new Error(error.message)
  return rows.length
}

/** Why a per-state item came off the file: its state was taken off the driver. */
export const STATE_REMOVED = "State removed from the driver's license history."

/**
 * Keeps per-state items (the hiring driving record) in step with the
 * driver's states. An open item for a state the driver no longer lists, or
 * the state-less one made before any state was saved, is marked not
 * applicable with STATE_REMOVED; it's put back if the state comes back.
 * Completed items are records and stay as they are. Items are never deleted.
 */
async function retireRemovedStates(
  supabase: SupabaseClient,
  driverId: string,
  planned: PlannedItem[],
  templates: DqTemplate[]
) {
  const perState = new Set(
    templates.filter((t) => t.per_state).map((t) => t.code)
  )
  if (!perState.size) return
  const { data } = await supabase
    .from("dq_items")
    .select(
      "id, template_code, license_state, completed_at, not_applicable_reason"
    )
    .eq("driver_id", driverId)
    .in("template_code", [...perState])
  const items = (data ?? []) as Pick<
    ItemRow,
    | "id"
    | "template_code"
    | "license_state"
    | "completed_at"
    | "not_applicable_reason"
  >[]
  const wanted = new Set(
    planned
      .filter((p) => perState.has(p.template_code))
      .map((p) => `${p.template_code}:${p.license_state ?? ""}`)
  )
  const key = (i: (typeof items)[number]) =>
    `${i.template_code}:${i.license_state ?? ""}`
  const retire = items
    .filter(
      (i) => !i.completed_at && !i.not_applicable_reason && !wanted.has(key(i))
    )
    .map((i) => i.id)
  const restore = items
    .filter(
      (i) => i.not_applicable_reason === STATE_REMOVED && wanted.has(key(i))
    )
    .map((i) => i.id)
  if (retire.length) {
    const { error } = await supabase
      .from("dq_items")
      .update({ not_applicable_reason: STATE_REMOVED })
      .in("id", retire)
    if (error) throw new Error(error.message)
  }
  if (restore.length) {
    const { error } = await supabase
      .from("dq_items")
      // The reason, who and when are set or cleared together.
      .update({
        not_applicable_reason: null,
        not_applicable_by: null,
        not_applicable_at: null,
      })
      .in("id", restore)
    if (error) throw new Error(error.message)
  }
}

/**
 * Builds the driver's checklist from their facts and adds the items they
 * don't have yet. Existing items, history and not-applicable marks are left
 * alone. Owners and admins only.
 */
export async function syncChecklist(
  supabase: SupabaseClient,
  driverId: string,
  today: string
): Promise<Result<{ added: number }>> {
  const driver = await loadDriver(supabase, driverId)
  if (!driver) return fail(404, NOT_FOUND)
  if (!(await isManager(supabase, driver.organization_id))) {
    return fail(403, MANAGERS_ONLY)
  }
  // The file is set up by its start date; until then there's no checklist.
  if (!driver.start_date) return ok({ added: 0 })
  const templates = await loadTemplates(supabase)
  const planned = buildChecklist(toDriver(driver), templates, today)
  // A requirement already started (any cycle) isn't added again.
  const { data } = await supabase
    .from("dq_items")
    .select("template_code, license_state")
    .eq("driver_id", driverId)
  const started = new Set(
    ((data ?? []) as Pick<ItemRow, "template_code" | "license_state">[]).map(
      (i) => `${i.template_code}:${i.license_state ?? ""}`
    )
  )
  try {
    const added = await insertPlanned(
      supabase,
      driver.organization_id,
      driverId,
      planned.filter(
        (p) => !started.has(`${p.template_code}:${p.license_state ?? ""}`)
      )
    )
    await retireRemovedStates(supabase, driverId, planned, templates)
    return ok({ added })
  } catch (error) {
    return fail(
      400,
      error instanceof Error ? error.message : "Couldn't add items."
    )
  }
}

// ------------------------------------------------------------- Uploads --

const EXTENSIONS: Record<(typeof DQ_UPLOAD_TYPES)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
}

/**
 * Uploads a photo or PDF to an item: by an owner or admin to any item, by
 * the driver to their own standard DQ items. It's waiting for review until
 * an owner or admin confirms it. Documents the AI may read are read, and
 * its reading is saved as a suggestion only.
 */
export async function uploadDocument(
  supabase: SupabaseClient,
  itemId: string,
  file: File
): Promise<
  Result<{ id: string; ai_extraction: Record<string, unknown> | null }>
> {
  const parsed = uploadSchema.safeParse({
    file_name: file.name,
    content_type: file.type,
    size_bytes: file.size,
  })
  if (!parsed.success) return fail(400, firstIssue(parsed.error))
  const item = await loadItem(supabase, itemId)
  if (!item) return fail(404, NOT_FOUND)
  if (item.not_applicable_reason) {
    return fail(400, "This item is marked not applicable.")
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const path = `${item.organization_id}/${item.driver_id}/${item.file_type}/${randomUUID()}.${EXTENSIONS[parsed.data.content_type]}`
  const upload = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: parsed.data.content_type,
    upsert: false,
  })
  if (upload.error) return fail(403, "The file couldn't be uploaded here.")

  const { data, error } = await supabase
    .from("dq_documents")
    .insert({
      organization_id: item.organization_id,
      dq_item_id: item.id,
      storage_path: path,
      source: "upload",
      file_name: parsed.data.file_name,
      content_type: parsed.data.content_type,
      size_bytes: parsed.data.size_bytes,
    })
    .select("id")
    .single()
  if (error) return dbError(error)
  const id = (data as { id: string }).id

  // A new upload replaces any still waiting for review, so there's one file
  // to review. Only owners and admins can mark files superseded; a driver's
  // earlier upload is replaced once the newest one is confirmed.
  if (await isManager(supabase, item.organization_id)) {
    const replaced = await supabase
      .from("dq_documents")
      .update({
        superseded_at: new Date().toISOString(),
        superseded_by: id,
      })
      .eq("dq_item_id", item.id)
      .neq("id", id)
      .is("confirmed_at", null)
      .is("superseded_at", null)
    if (replaced.error) return dbError(replaced.error)
  }

  let extraction: Record<string, unknown> | null = null
  if (canReadWithAi(item.template_code, item.file_type)) {
    const read = await readDqDocument({
      templateCode: item.template_code,
      fileType: item.file_type,
      bytes,
      contentType: parsed.data.content_type,
    })
    if (read.ok) {
      extraction = read.extraction
      await supabase
        .from("dq_documents")
        .update({
          ai_extraction: extraction,
          ai_extracted_at: new Date().toISOString(),
        })
        .eq("id", id)
    }
  }
  return ok({ id, ai_extraction: extraction })
}

// -------------------------------------------------------- Completion --

/**
 * Completes an item and adds what comes after it: the next cycle, the
 * items that follow it, and anything its result triggers.
 */
async function complete(
  supabase: SupabaseClient,
  item: ItemRow,
  input: {
    done: string
    expires: string | null
    queryResult: ItemRow["query_result"]
  }
): Promise<Result<{ added: number }>> {
  const templates = await loadTemplates(supabase)
  const template = templates.find((t) => t.id === item.template_id)
  const driver = await loadDriver(supabase, item.driver_id)
  if (!template || !driver) return fail(404, NOT_FOUND)

  let until: string | null
  try {
    until = validUntil(template, input.done, input.expires)
  } catch (error) {
    return fail(
      400,
      error instanceof Error ? error.message : "Check the dates."
    )
  }

  const completedAt = item.completed_at ?? new Date().toISOString()
  const { error } = await supabase
    .from("dq_items")
    .update({
      completed_at: completedAt,
      valid_until: until,
      query_result: input.queryResult,
    })
    .eq("id", item.id)
  if (error) return dbError(error)

  // A result corrected away from "record found" no longer calls for the
  // items it triggered (the 24-hour full query), if they're still open.
  if (
    item.query_result === "record_found" &&
    input.queryResult !== "record_found"
  ) {
    const close = await supabase
      .from("dq_items")
      .update({
        not_applicable_reason:
          "Not needed: the query result was corrected to no record.",
      })
      .eq("triggered_by_item_id", item.id)
      .is("completed_at", null)
      .is("not_applicable_reason", null)
    if (close.error) return dbError(close.error)
  }

  const planned = nextCycle(
    {
      ...item,
      completed_at: completedAt,
      valid_until: until,
      done_on: input.done,
      query_result: input.queryResult,
    },
    templates,
    toDriver(driver)
  )
  try {
    const added = await insertPlanned(
      supabase,
      item.organization_id,
      item.driver_id,
      planned,
      item.id,
      templates
    )
    // A correction moves the next cycle's due date if it's still open.
    for (const next of planned) {
      await supabase
        .from("dq_items")
        .update({ due_date: next.due_date })
        .eq("driver_id", item.driver_id)
        .eq("template_code", next.template_code)
        .eq("cycle_number", next.cycle_number)
        .is("completed_at", null)
        .is("not_applicable_reason", null)
    }
    return ok({ added })
  } catch (err) {
    return fail(
      400,
      err instanceof Error ? err.message : "Couldn't add the next items."
    )
  }
}

/** The codes whose result triggers another item, so need a result. */
const needsQueryResult = (templates: DqTemplate[], code: string) =>
  templates.some((t) => t.trigger_code === code)

/**
 * Confirms (or corrects) a document's details. The AI's reading is only a
 * suggestion; these values are what counts. Supersedes the item's other
 * documents and completes the item. Owners and admins only.
 */
export async function confirmDocument(
  supabase: SupabaseClient,
  documentId: string,
  body: unknown,
  today: string
): Promise<Result<{ added: number }>> {
  const parsed = confirmDocumentSchema.safeParse(body)
  if (!parsed.success) return fail(400, firstIssue(parsed.error))
  const input = parsed.data
  if (input.issue_date > today) {
    return fail(400, "The issue date can't be in the future.")
  }

  const { data } = await supabase
    .from("dq_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("id", documentId)
    .maybeSingle()
  const document = data as DocumentRow | null
  if (!document) return fail(404, NOT_FOUND)
  if (!(await isManager(supabase, document.organization_id))) {
    return fail(403, MANAGERS_ONLY)
  }
  if (document.superseded_at) {
    return fail(400, "A newer document replaced this one.")
  }
  const item = await loadItem(supabase, document.dq_item_id)
  if (!item) return fail(404, NOT_FOUND)
  if (item.not_applicable_reason) {
    return fail(400, "This item is marked not applicable.")
  }
  const templates = await loadTemplates(supabase)
  const template = templates.find((t) => t.id === item.template_id)
  if (!template) return fail(404, NOT_FOUND)
  if (template.evidence === "contact_log") {
    return fail(400, "This item is completed from the employer contact log.")
  }
  if (template.max_validity_months !== null && !input.expiry_date) {
    return fail(400, "Enter the expiry date printed on it.")
  }
  if (needsQueryResult(templates, template.code) && !input.query_result) {
    return fail(400, "Choose what the query showed.")
  }
  // A copy of the employment application only counts signed by the driver;
  // nobody else can sign it for them. It doesn't expire.
  const application = template.code === "employment_application"
  if (application && !input.driver_signed) {
    return fail(400, "Check that the driver signed and dated it.")
  }
  const expiry = application ? null : input.expiry_date

  const update = await supabase
    .from("dq_documents")
    .update({
      issue_date: input.issue_date,
      expiry_date: expiry,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", document.id)
  if (update.error) return dbError(update.error)

  // The confirmed one replaces the item's other live documents.
  const supersede = await supabase
    .from("dq_documents")
    .update({
      superseded_at: new Date().toISOString(),
      superseded_by: document.id,
    })
    .eq("dq_item_id", item.id)
    .neq("id", document.id)
    .is("superseded_at", null)
  if (supersede.error) return dbError(supersede.error)

  return complete(supabase, item, {
    done: input.issue_date,
    expires: expiry,
    queryResult: input.query_result,
  })
}

/**
 * Completes an item that isn't completed by confirming a document: one the
 * driver signed (the employment application, once reviewed), or the
 * previous-employer checks once contacts are logged. Owners and admins only.
 */
export async function completeItem(
  supabase: SupabaseClient,
  itemId: string,
  today: string
): Promise<Result<{ added: number }>> {
  const item = await loadItem(supabase, itemId)
  if (!item) return fail(404, NOT_FOUND)
  if (!(await isManager(supabase, item.organization_id))) {
    return fail(403, MANAGERS_ONLY)
  }
  if (item.completed_at) return fail(400, "This item is already complete.")
  if (item.not_applicable_reason) {
    return fail(400, "This item is marked not applicable.")
  }
  const templates = await loadTemplates(supabase)
  const template = templates.find((t) => t.id === item.template_id)
  if (!template) return fail(404, NOT_FOUND)

  if (template.evidence === "contact_log") {
    const { count } = await supabase
      .from("dq_employer_checks")
      .select("id", { count: "exact", head: true })
      .eq("driver_id", item.driver_id)
      .is("removed_at", null)
    if (!count) return fail(400, "Log at least one employer contact first.")
  } else {
    const { data } = await supabase
      .from("dq_attestations")
      .select("signed_at")
      .eq("dq_item_id", item.id)
      .is("voided_at", null)
      .order("signed_at", { ascending: false })
      .limit(1)
    const signed = (data ?? []) as { signed_at: string }[]
    if (!signed[0]) {
      return fail(400, "Confirm a document or sign this item instead.")
    }
    return complete(supabase, item, {
      done: dateOf(signed[0].signed_at),
      expires: null,
      queryResult: null,
    })
  }
  return complete(supabase, item, {
    done: today,
    expires: null,
    queryResult: null,
  })
}

// ------------------------------------------------------------- Signing --

async function organizationName(
  supabase: SupabaseClient,
  organizationId: string,
  driverId: string
) {
  const { data } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle()
  if (data) return (data as { name: string }).name
  // Drivers can't read organizations; my_dq_drivers gives them the name.
  const mine = await supabase.rpc("my_dq_drivers")
  const row = (
    (mine.data ?? []) as {
      driver_id: string
      organization_name: string
      full_name: string
    }[]
  ).find((r) => r.driver_id === driverId)
  return row?.organization_name ?? ""
}

async function driverName(supabase: SupabaseClient, driverId: string) {
  const driver = await loadDriver(supabase, driverId)
  if (driver) return driver.full_name
  const mine = await supabase.rpc("my_dq_drivers")
  const row = (
    (mine.data ?? []) as { driver_id: string; full_name: string }[]
  ).find((r) => r.driver_id === driverId)
  return row?.full_name ?? ""
}

/** Saves a signed record and its PDF. */
async function saveSignature(
  supabase: SupabaseClient,
  item: ItemRow,
  record: {
    type: AttestationRow["type"]
    signerName: string
    statement: string
    pdf: (signature: Signature) => Promise<Uint8Array>
  }
): Promise<
  Result<{
    id: string
    signed_at: string
    signer_role: Signature["signerRole"]
  }>
> {
  const { data, error } = await supabase
    .from("dq_attestations")
    .insert({
      organization_id: item.organization_id,
      dq_item_id: item.id,
      type: record.type,
      signer_name: record.signerName,
      // Set again by the database from who's signed in.
      signer_role: "driver",
      statement_text: record.statement,
    })
    .select("id, signed_at, signer_role")
    .single()
  if (error) return dbError(error)
  const signed = data as {
    id: string
    signed_at: string
    signer_role: Signature["signerRole"]
  }

  const bytes = await record.pdf({
    signerName: record.signerName,
    signerRole: signed.signer_role,
    signedAt: signed.signed_at,
  })
  const path = `${item.organization_id}/${item.driver_id}/${item.file_type}/${signed.id}.pdf`
  const upload = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: false,
  })
  if (upload.error) {
    return fail(500, "The signature is saved, but its PDF couldn't be stored.")
  }
  const attach = await supabase
    .from("dq_attestations")
    .update({ pdf_path: path })
    .eq("id", signed.id)
  if (attach.error) return dbError(attach.error)
  return ok(signed)
}

/**
 * Signs an item's record: the annual review note or registry-verification
 * note (an owner or admin, which also completes the item), or the employment
 * application (the driver, after saving it; an owner or admin then reviews
 * and completes it).
 */
export async function signItem(
  supabase: SupabaseClient,
  itemId: string,
  body: unknown,
  today: string
): Promise<Result<{ id: string }>> {
  const item = await loadItem(supabase, itemId)
  if (!item) return fail(404, NOT_FOUND)
  if (item.completed_at) return fail(400, "This item is already complete.")
  if (item.not_applicable_reason) {
    return fail(400, "This item is marked not applicable.")
  }
  const footer = EXPORT_DISCLAIMER
  const [orgName, name] = await Promise.all([
    organizationName(supabase, item.organization_id, item.driver_id),
    driverName(supabase, item.driver_id),
  ])

  if (item.template_code === "employment_application") {
    const parsed = applicationSignSchema.safeParse(body)
    if (!parsed.success) return fail(400, firstIssue(parsed.error))
    if (!(await isTheDriver(supabase, item.organization_id, item.driver_id))) {
      return fail(403, "Only the driver can sign their application.")
    }
    const { data } = await supabase
      .from("dq_employment_applications")
      .select(
        "id, answers, ssn_last4, date_of_birth_ciphertext, attestation_id"
      )
      .eq("dq_item_id", item.id)
      .maybeSingle()
    const application = data as {
      id: string
      answers: unknown
      ssn_last4: string | null
      date_of_birth_ciphertext: string | null
      attestation_id: string | null
    } | null
    if (!application) return fail(400, "Fill in the application first.")
    if (application.attestation_id) return fail(400, "It's already signed.")
    const answers = applicationAnswersSchema.safeParse(application.answers)
    if (!answers.success) {
      return fail(
        400,
        `Finish the application first. ${firstIssue(answers.error)}`
      )
    }
    if (!application.ssn_last4 || !application.date_of_birth_ciphertext) {
      return fail(
        400,
        "Add your Social Security number and date of birth first."
      )
    }
    const statement = applicationStatement()
    const signed = await saveSignature(supabase, item, {
      type: "employment_application",
      signerName: parsed.data.signer_name,
      statement,
      pdf: (signature) =>
        applicationPdf({
          organizationName: orgName,
          answers: answers.data,
          ssnLast4: application.ssn_last4,
          dateOfBirthOnFile: true,
          statement,
          signature,
          footer,
        }),
    })
    if (!signed.ok) return signed
    const link = await supabase
      .from("dq_employment_applications")
      .update({ attestation_id: signed.data.id })
      .eq("id", application.id)
    if (link.error) return dbError(link.error)
    return ok({ id: signed.data.id })
  }

  if (!(await isManager(supabase, item.organization_id))) {
    return fail(403, MANAGERS_ONLY)
  }

  if (item.template_code === "annual_review") {
    const parsed = annualReviewSignSchema.safeParse(body)
    if (!parsed.success) return fail(400, firstIssue(parsed.error))
    // The MVR this review is of: the same cycle's annual MVR, confirmed.
    const { data: mvr } = await supabase
      .from("dq_items")
      .select("id")
      .eq("driver_id", item.driver_id)
      .eq("template_code", "annual_mvr")
      .eq("cycle_number", item.cycle_number)
      .maybeSingle()
    let mvrDate: string | null = null
    if (mvr) {
      const { data: doc } = await supabase
        .from("dq_documents")
        .select("issue_date")
        .eq("dq_item_id", (mvr as { id: string }).id)
        .not("confirmed_at", "is", null)
        .is("superseded_at", null)
        .maybeSingle()
      mvrDate =
        (doc as { issue_date: string | null } | null)?.issue_date ?? null
    }
    if (!mvrDate) {
      return fail(
        400,
        "Confirm the annual driving record before signing its review."
      )
    }
    const statement = annualReviewStatement({ driverName: name, mvrDate })
    const signed = await saveSignature(supabase, item, {
      type: "annual_review",
      signerName: parsed.data.signer_name,
      statement,
      pdf: (signature) =>
        signedNotePdf({
          organizationName: orgName,
          title: "Annual review of driving record",
          driverName: name,
          fields: [
            ["Driving record dated", mvrDate],
            ["Reviewed by", parsed.data.signer_name],
          ],
          statement,
          signature,
          footer,
        }),
    })
    if (!signed.ok) return signed
    const done = await complete(supabase, item, {
      done: dateOf(signed.data.signed_at),
      expires: null,
      queryResult: null,
    })
    return done.ok ? ok({ id: signed.data.id }) : done
  }

  if (item.template_code === "registry_verification") {
    const parsed = registrySignSchema.safeParse(body)
    if (!parsed.success) return fail(400, firstIssue(parsed.error))
    if (parsed.data.verified_on > today) {
      return fail(400, "The verification date can't be in the future.")
    }
    const statement = registryStatement({
      driverName: name,
      examinerName: parsed.data.examiner_name,
      registryNumber: parsed.data.registry_number,
      verifiedOn: parsed.data.verified_on,
    })
    const signed = await saveSignature(supabase, item, {
      type: "registry_verification",
      signerName: parsed.data.signer_name,
      statement,
      pdf: (signature) =>
        signedNotePdf({
          organizationName: orgName,
          title: "Medical examiner registry verification",
          driverName: name,
          fields: [
            ["Medical examiner", parsed.data.examiner_name],
            ["National Registry number", parsed.data.registry_number],
            ["Verified on", parsed.data.verified_on],
          ],
          statement,
          signature,
          footer,
        }),
    })
    if (!signed.ok) return signed
    const done = await complete(supabase, item, {
      done: parsed.data.verified_on,
      expires: null,
      queryResult: null,
    })
    return done.ok ? ok({ id: signed.data.id }) : done
  }

  return fail(
    400,
    "This item isn't signed in the app. Upload a document instead."
  )
}

// ------------------------------------------------- Employment application --

/**
 * Saves the driver's application before they sign it. The SSN and date of
 * birth are encrypted here; only the SSN's last 4 digits come back.
 */
export async function saveApplication(
  supabase: SupabaseClient,
  itemId: string,
  body: unknown
): Promise<Result<{ ssn_last4: string | null }>> {
  const parsed = applicationDraftSchema.safeParse(body)
  if (!parsed.success) return fail(400, firstIssue(parsed.error))
  const item = await loadItem(supabase, itemId)
  if (!item || item.template_code !== "employment_application") {
    return fail(404, NOT_FOUND)
  }
  if (!(await isTheDriver(supabase, item.organization_id, item.driver_id))) {
    return fail(403, "Only the driver fills in their application.")
  }

  let keyring
  try {
    keyring = keyringFromEnv()
  } catch {
    return fail(503, "Saving applications isn't set up yet.")
  }

  const changes: Record<string, unknown> = { answers: parsed.data.answers }
  let last4: string | null = null
  if (parsed.data.ssn) {
    const sealed = sealSsn(parsed.data.ssn, item.driver_id, keyring)
    if (!sealed) return fail(400, "Enter a valid Social Security number.")
    changes.ssn_ciphertext = sealed.ciphertext
    changes.ssn_last4 = sealed.last4
    last4 = sealed.last4
  }
  if (parsed.data.date_of_birth) {
    const sealed = sealDateOfBirth(
      parsed.data.date_of_birth,
      item.driver_id,
      keyring
    )
    if (!sealed) return fail(400, "Enter a valid date of birth.")
    changes.date_of_birth_ciphertext = sealed
  }

  const { data: existing } = await supabase
    .from("dq_employment_applications")
    .select("id, ssn_last4")
    .eq("dq_item_id", item.id)
    .maybeSingle()
  const row = existing as { id: string; ssn_last4: string | null } | null
  const write = row
    ? await supabase
        .from("dq_employment_applications")
        .update(changes)
        .eq("id", row.id)
    : await supabase.from("dq_employment_applications").insert({
        organization_id: item.organization_id,
        dq_item_id: item.id,
        ...changes,
      })
  if (write.error) return dbError(write.error)
  return ok({ ssn_last4: last4 ?? row?.ssn_last4 ?? null })
}

// ---------------------------------------------- Not applicable, end date --

/** Marks an open item not applicable, with the reason. Owners and admins. */
export async function markNotApplicable(
  supabase: SupabaseClient,
  itemId: string,
  body: unknown
): Promise<Result<{ id: string }>> {
  const parsed = notApplicableSchema.safeParse(body)
  if (!parsed.success) return fail(400, firstIssue(parsed.error))
  const item = await loadItem(supabase, itemId)
  if (!item) return fail(404, NOT_FOUND)
  if (!(await isManager(supabase, item.organization_id))) {
    return fail(403, MANAGERS_ONLY)
  }
  if (item.completed_at) {
    return fail(400, "A completed item can't be marked not applicable.")
  }
  const { error } = await supabase
    .from("dq_items")
    .update({ not_applicable_reason: parsed.data.reason })
    .eq("id", item.id)
  if (error) return dbError(error)
  return ok({ id: item.id })
}

/** Starts the reason on items closed because the driver left. */
const LEFT_REASON = "Not needed: the driver left on"

/**
 * Reopens what leaving closed, for a driver back at work (or marked as
 * left by mistake): items closed only because they left go back on the
 * file. Anything closed for another reason, or done, stays as it is. Run
 * after their end date is cleared, since a closed file can't change.
 */
export async function reopenAfterReturn(
  supabase: SupabaseClient,
  driverId: string
): Promise<Result<{ reopened: number }>> {
  const { data, error } = await supabase
    .from("dq_items")
    // The reason, who and when are set or cleared together.
    .update({
      not_applicable_reason: null,
      not_applicable_by: null,
      not_applicable_at: null,
    })
    .eq("driver_id", driverId)
    .is("completed_at", null)
    .like("not_applicable_reason", `${LEFT_REASON}%`)
    .select("id")
  if (error) return dbError(error)
  return ok({ reopened: (data ?? []).length })
}

/**
 * Sets the day the driver left. Open items due after it are marked not
 * applicable first (once the date passes, the file is read-only). Recurring
 * work stops, and the retention clock starts. Owners and admins.
 */
export async function setEndDate(
  supabase: SupabaseClient,
  driverId: string,
  body: unknown
): Promise<Result<{ closed: number }>> {
  const parsed = endDateSchema.safeParse(body)
  if (!parsed.success) return fail(400, firstIssue(parsed.error))
  const endDate = parsed.data.end_date
  const driver = await loadDriver(supabase, driverId)
  if (!driver) return fail(404, NOT_FOUND)
  if (!(await isManager(supabase, driver.organization_id))) {
    return fail(403, MANAGERS_ONLY)
  }
  if (driver.start_date && endDate < driver.start_date) {
    return fail(400, "The end date can't be before the start date.")
  }

  const { data, error } = await supabase
    .from("dq_items")
    .update({
      not_applicable_reason: `${LEFT_REASON} ${endDate}.`,
    })
    .eq("driver_id", driverId)
    .is("completed_at", null)
    .is("not_applicable_reason", null)
    .gt("due_date", endDate)
    .select("id")
  if (error) return dbError(error)

  // Someone who has left isn't driving: once their last day has come,
  // they're inactive. A later last day (notice given) waits for that day.
  const update = await supabase
    .from("drivers")
    .update(
      endDate <= getToday()
        ? { end_date: endDate, status: "inactive" }
        : { end_date: endDate }
    )
    .eq("id", driverId)
  if (update.error) return dbError(update.error)
  return ok({ closed: (data ?? []).length })
}

// ------------------------------------------------ Previous-employer log --

/**
 * Logs one contact with a previous employer, failed ones included, or that
 * the driver had no previous DOT-regulated employer in the past 3 years.
 */
export async function logEmployerCheck(
  supabase: SupabaseClient,
  driverId: string,
  body: unknown
): Promise<Result<{ id: string }>> {
  const parsed = employerCheckSchema.safeParse(body)
  if (!parsed.success) return fail(400, firstIssue(parsed.error))
  const check = parsed.data
  const driver = await loadDriver(supabase, driverId)
  if (!driver) return fail(404, NOT_FOUND)
  if (!(await isManager(supabase, driver.organization_id))) {
    return fail(403, MANAGERS_ONLY)
  }

  let row: Record<string, unknown>
  if (check.outcome === NO_PREVIOUS_EMPLOYERS) {
    row = {
      outcome: check.outcome,
      response_summary: check.response_summary,
      contacted_at: new Date().toISOString(),
      employer_name: null,
      method: null,
    }
  } else {
    if (check.response_document_id) {
      const { data } = await supabase
        .from("dq_documents")
        .select("driver_id, file_type")
        .eq("id", check.response_document_id)
        .maybeSingle()
      const doc = data as { driver_id: string; file_type: string } | null
      if (
        !doc ||
        doc.driver_id !== driverId ||
        doc.file_type !== "investigation"
      ) {
        return fail(
          400,
          "Attach a document from this driver's investigation file."
        )
      }
    }
    row = check
  }

  const { data, error } = await supabase
    .from("dq_employer_checks")
    .insert({
      organization_id: driver.organization_id,
      driver_id: driverId,
      ...row,
    })
    .select("id")
    .single()
  if (error) return dbError(error)
  return ok({ id: (data as { id: string }).id })
}

// ------------------------------------------------------------- Voiding --

/**
 * Voids a signed annual review or registry-verification note that has a
 * mistake, with the reason. The note stays in the file's history, marked
 * void. Its item opens again (unless a confirmed document still covers it),
 * so the note can be signed again. Owners and admins.
 */
export async function voidSignature(
  supabase: SupabaseClient,
  signatureId: string,
  body: unknown
): Promise<Result<{ reopened: boolean }>> {
  const parsed = voidSignatureSchema.safeParse(body)
  if (!parsed.success) return fail(400, firstIssue(parsed.error))
  const { data } = await supabase
    .from("dq_attestations")
    .select("id, organization_id, dq_item_id, type, voided_at")
    .eq("id", signatureId)
    .maybeSingle()
  const signature = data as {
    id: string
    organization_id: string
    dq_item_id: string
    type: AttestationRow["type"]
    voided_at: string | null
  } | null
  if (!signature) return fail(404, NOT_FOUND)
  if (!(await isManager(supabase, signature.organization_id))) {
    return fail(403, MANAGERS_ONLY)
  }
  if (signature.type === "employment_application") {
    return fail(400, "The driver's signed application can't be voided here.")
  }
  if (signature.voided_at) return fail(400, "It's already void.")

  const update = await supabase
    .from("dq_attestations")
    .update({
      voided_at: new Date().toISOString(),
      void_reason: parsed.data.reason,
    })
    .eq("id", signature.id)
  if (update.error) return dbError(update.error)

  // Open the item again so the note can be signed again, unless another
  // signature or a confirmed document still covers it.
  const [{ count: signatures }, { count: documents }] = await Promise.all([
    supabase
      .from("dq_attestations")
      .select("id", { count: "exact", head: true })
      .eq("dq_item_id", signature.dq_item_id)
      .is("voided_at", null),
    supabase
      .from("dq_documents")
      .select("id", { count: "exact", head: true })
      .eq("dq_item_id", signature.dq_item_id)
      .not("confirmed_at", "is", null)
      .is("superseded_at", null),
  ])
  if (signatures || documents) return ok({ reopened: false })
  const reopen = await supabase
    .from("dq_items")
    .update({ completed_at: null, completed_by: null, valid_until: null })
    .eq("id", signature.dq_item_id)
    .not("completed_at", "is", null)
  if (reopen.error) return dbError(reopen.error)
  return ok({ reopened: true })
}

/**
 * Takes an upload nobody has confirmed out of the file, e.g. the wrong file
 * picked by mistake. Documents are never deleted: it's marked superseded by
 * itself, which keeps it in storage and the audit log, hides it from the
 * checklist and locks it. A confirmed document is fixed with Replace or
 * Edit instead, so a completed item never reopens here. Owners and admins.
 */
export async function removeDocument(
  supabase: SupabaseClient,
  documentId: string
): Promise<Result<{ id: string }>> {
  const { data } = await supabase
    .from("dq_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("id", documentId)
    .maybeSingle()
  const document = data as DocumentRow | null
  if (!document) return fail(404, NOT_FOUND)
  if (!(await isManager(supabase, document.organization_id))) {
    return fail(403, MANAGERS_ONLY)
  }
  if (document.superseded_at) {
    return fail(400, "That file was already removed or replaced.")
  }
  if (document.confirmed_at) {
    return fail(
      400,
      "This file is confirmed. Upload the right one to replace it, or edit its dates."
    )
  }
  const { error } = await supabase
    .from("dq_documents")
    .update({
      superseded_at: new Date().toISOString(),
      superseded_by: document.id,
    })
    .eq("id", document.id)
    .is("superseded_at", null)
  if (error) return dbError(error)
  return ok({ id: document.id })
}

/**
 * Removes an entry from the previous-employer contact log (one logged by
 * mistake). It's marked removed, not deleted: it leaves the log and the
 * export and stays in the file's history. Owners and admins.
 */
export async function removeEmployerCheck(
  supabase: SupabaseClient,
  checkId: string
): Promise<Result<{ id: string }>> {
  const { data } = await supabase
    .from("dq_employer_checks")
    .select("id, organization_id, removed_at")
    .eq("id", checkId)
    .maybeSingle()
  const check = data as {
    id: string
    organization_id: string
    removed_at: string | null
  } | null
  if (!check) return fail(404, NOT_FOUND)
  if (!(await isManager(supabase, check.organization_id))) {
    return fail(403, MANAGERS_ONLY)
  }
  if (check.removed_at) return fail(400, "That entry was already removed.")
  const { error } = await supabase
    .from("dq_employer_checks")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", check.id)
  if (error) return dbError(error)
  return ok({ id: check.id })
}
