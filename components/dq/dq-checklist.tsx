"use client"

import { cn } from "cn"
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  History,
  Hourglass,
  MinusCircle,
  PenLine,
} from "lucide-react"
import { Fragment, useState } from "react"

import {
  DATE_STATUSES,
  DqStatusBadge,
  DueDate,
} from "@/components/dq/dq-badges"
import {
  ItemActions,
  lowerFirst,
  takesUploads,
  VoidSignatureButton,
  type ItemRules,
} from "@/components/dq/item-actions"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { LocalDate } from "@/components/local-date"
import { Button } from "@/components/ui/button"
import type { DqItemStatus } from "@/lib/dq-rules"
import type { ChecklistEntry } from "@/lib/dq/service"

const day = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

/** Each status as the colored tile at the start of its row. */
const TILES: Record<DqItemStatus, { tile: string; icon: typeof CheckCircle2 }> =
  {
    complete: { tile: "bg-brand/10 text-brand", icon: CheckCircle2 },
    upcoming: { tile: "bg-muted text-muted-foreground", icon: CalendarClock },
    due_soon: { tile: "bg-amber-500/15 text-amber-700", icon: Clock },
    pending_review: { tile: "bg-sky-500/15 text-sky-700", icon: Hourglass },
    overdue: {
      tile: "bg-destructive/10 text-destructive",
      icon: AlertTriangle,
    },
    missing: { tile: "bg-muted text-muted-foreground", icon: Circle },
    not_applicable: {
      tile: "bg-muted text-muted-foreground",
      icon: MinusCircle,
    },
  }

/** Parts of an item's note, " · " between them, skipping empty ones. */
function joinNote(parts: React.ReactNode[]) {
  return parts.filter(Boolean).map((part, i) => (
    <Fragment key={i}>
      {i > 0 && " · "}
      {part}
    </Fragment>
  ))
}

/** The line under an item's title: what's on file, or which year it is. */
function itemNote(item: ChecklistEntry, showYear = false): React.ReactNode {
  if (item.not_applicable_reason) return item.not_applicable_reason
  const year =
    item.cycle_number > 1 || showYear
      ? item.current
        ? `Year ${item.cycle_number}`
        : `Earlier: year ${item.cycle_number}`
      : null
  if (item.completed_at) {
    const confirmed = item.documents.find((d) => d.confirmed && !d.superseded)
    // The document's own date, or else when it was completed (a moment, so
    // shown on the viewer's day).
    return joinNote([
      year,
      <>
        On file, dated{" "}
        {confirmed?.issue_date ? (
          day(confirmed.issue_date)
        ) : (
          <LocalDate value={item.completed_at} />
        )}
      </>,
    ])
  }
  // An upload waiting for review: the file (its name in the tooltip) and
  // Review are on the right.
  if (item.status === "pending_review") {
    const uploaded = item.documents.some((d) => !d.confirmed && !d.superseded)
    return joinNote([
      year,
      uploaded
        ? "Uploaded, waiting for review"
        : item.template_code === "employment_application"
          ? "Signed by the driver. Approve it to file it."
          : "Signed, waiting for review",
    ])
  }
  // The right of the row shows a badge rather than the date for these, so
  // the date goes here.
  const dated = DATE_STATUSES.includes(item.status)
  const due = !item.due_date
    ? "Due once the start date is set"
    : dated
      ? "Not on file yet"
      : `Due ${day(item.due_date)}`
  // The office can't upload the application, so say who fills it in.
  const signed = item.signatures.some((s) => !s.voided_at)
  const how =
    item.template_code === "employment_application"
      ? signed
        ? "Signed by the driver. Approve it to file it."
        : "The driver fills this in and signs it in the driver app, or upload a copy they signed."
      : null
  return [year, due, how].filter(Boolean).join(" · ")
}

/**
 * When it's due or good until, colored by status, or its status when the
 * date isn't what matters (waiting for review, missing, not needed).
 */
function DueCell({ item }: { item: ChecklistEntry }) {
  // Waiting for review shows on the tile and the line under the name, so
  // here it's just the date.
  if (item.status === "pending_review") {
    return item.due_date ? (
      <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        Due {day(item.due_date)}
      </span>
    ) : null
  }
  // Done shows on the tile and "On file" under the name. Its expiry only
  // shows once it's close (due soon) or past (overdue), below.
  if (item.status === "complete") return null
  if (!DATE_STATUSES.includes(item.status)) {
    return <DqStatusBadge status={item.status} />
  }
  const date = item.completed_at ? item.valid_until : item.due_date
  if (!date) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  return (
    <span className="text-xs whitespace-nowrap tabular-nums">
      <DueDate status={item.status}>
        {item.completed_at ? "Good until" : "Due"} {day(date)}
      </DueDate>
    </span>
  )
}

/** Most urgent first; the rest keep their order. */
const ORDER: DqItemStatus[] = [
  "overdue",
  "missing",
  "pending_review",
  "due_soon",
  "upcoming",
  "complete",
  "not_applicable",
]

/**
 * One item, like the CDL copy on the Overview tab: a status tile, its
 * name and what's on file, and its date and actions on the right.
 * In a narrow card the date and actions drop under the name.
 */
/** An item's signatures, as list items: who signed when, or voided why. */
function Signatures({
  item,
  manager,
}: {
  item: ChecklistEntry
  manager: boolean
}) {
  return (
    <>
      {item.signatures.map((signature) =>
        signature.voided_at ? (
          <li key={signature.id} className="text-muted-foreground">
            <span className="inline-flex items-center gap-1 line-through">
              <PenLine className="size-3.5" />
              Signed by {signature.signer_name},{" "}
              <LocalDate value={signature.signed_at} />
            </span>
            {/* On its own line, lined up with the text past the pen. */}
            <span className="block pl-4.5">Void: {signature.void_reason}</span>
          </li>
        ) : (
          <li key={signature.id} className="flex items-center gap-2">
            <a
              href={signature.url ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-brand hover:underline"
            >
              <PenLine className="size-3.5" />
              Signed by {signature.signer_name},{" "}
              <LocalDate value={signature.signed_at} />
            </a>
            {manager &&
              item.current &&
              signature.type !== "employment_application" && (
                <VoidSignatureButton
                  signatureId={signature.id}
                  label={`the ${lowerFirst(item.title)}`}
                />
              )}
          </li>
        )
      )}
    </>
  )
}

/**
 * An item that comes round with this one (the annual review with that
 * year's annual MVR), as a line under it: whether it's signed and when it's
 * due, with its signatures.
 */
function FollowerLine({
  item,
  manager,
}: {
  item: ChecklistEntry
  manager: boolean
}) {
  const status = item.not_applicable_reason ? (
    item.not_applicable_reason
  ) : item.completed_at ? (
    "Signed"
  ) : item.due_date ? (
    <DueDate status={item.status}>
      Not signed yet · due {day(item.due_date)}
    </DueDate>
  ) : (
    "Not signed yet"
  )
  return (
    <div className="space-y-0.5 pt-1 text-xs">
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{item.title}</span> ·{" "}
        {status}
      </p>
      {item.signatures.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          <Signatures item={item} manager={manager} />
        </ul>
      )}
    </div>
  )
}

function ItemRow({
  item,
  followers,
  showYear,
  rules,
  manager,
  driverName,
  signerName,
}: {
  item: ChecklistEntry
  /** Items that come round with this one, shown on its row. */
  followers: ChecklistEntry[]
  /** Another year of the same record is shown too, so say which this is. */
  showYear: boolean
  rules: Record<string, ItemRules>
  manager: boolean
  driverName: string
  signerName: string
}) {
  // The item's newest file is shown on the upload button instead.
  const onButton =
    manager && item.current && !item.not_applicable_reason && takesUploads(item)
      ? item.documents.find((d) => !d.superseded)?.id
      : undefined
  const listed = item.documents.filter(
    (d) => !d.superseded && d.id !== onButton
  )
  const { tile, icon: Icon } = TILES[item.status]
  return (
    <li
      className={cn(
        "flex flex-col gap-3 px-6 py-3 @xl:flex-row @xl:items-center",
        !item.current && "bg-muted/30"
      )}
    >
      {/* The name keeps room to read; wide actions wrap instead. */}
      <div className="flex min-w-0 flex-1 items-center gap-3 @xl:min-w-48">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md",
            tile
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">
            {item.title}
            {item.license_state && ` · ${item.license_state}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {itemNote(item, showYear)}
          </p>
          {(listed.length > 0 || item.signatures.length > 0) && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
              {listed.map((document) => (
                <li key={document.id}>
                  <a
                    href={document.url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-brand hover:underline"
                  >
                    <FileText className="size-3.5" />
                    {document.file_name}
                  </a>
                  {!document.confirmed && (
                    <span className="ml-1 text-sky-800">(not confirmed)</span>
                  )}
                </li>
              ))}
              <Signatures item={item} manager={manager} />
            </ul>
          )}
          {followers.map((follower) => (
            <FollowerLine key={follower.id} item={follower} manager={manager} />
          ))}
        </div>
      </div>
      {/* Lined up under the name, past the tile, when it drops down. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-13 @xl:flex-nowrap @xl:justify-end @xl:pl-0">
        <DueCell item={item} />
        {/* The follower's Sign comes first, then the item's own file. */}
        {manager &&
          followers.map((follower) => (
            <ItemActions
              key={follower.id}
              item={follower}
              rules={
                rules[follower.template_code] ?? {
                  needsExpiry: false,
                  needsQueryResult: false,
                }
              }
              driverName={driverName}
              signerName={signerName}
            />
          ))}
        {manager && (
          <ItemActions
            item={item}
            rules={
              rules[item.template_code] ?? {
                needsExpiry: false,
                needsQueryResult: false,
              }
            }
            driverName={driverName}
            signerName={signerName}
          />
        )}
      </div>
    </li>
  )
}

/**
 * One file of the driver's records: a box per item, most urgent first,
 * with earlier years under History.
 */
export function DqChecklist({
  title,
  description,
  items,
  rules,
  manager,
  driverName,
  signerName,
}: {
  title: string
  description: string
  items: ChecklistEntry[]
  rules: Record<string, ItemRules>
  manager: boolean
  driverName: string
  signerName: string
}) {
  const [history, setHistory] = useState(false)
  const current = items.filter((item) => item.current)
  const past = items.filter((item) => !item.current)
  // An item that comes round with another (the annual review with that
  // year's MVR) goes on that item's row, when the row is shown.
  const candidates = [...current, ...(history ? past : [])]
  const candidateIds = new Set(candidates.map((item) => item.id))
  const folded = (item: ChecklistEntry) =>
    !!item.paired_with && candidateIds.has(item.paired_with)
  const followersOf = new Map<string, ChecklistEntry[]>()
  for (const item of candidates) {
    if (!folded(item) || !item.paired_with) continue
    followersOf.set(item.paired_with, [
      ...(followersOf.get(item.paired_with) ?? []),
      item,
    ])
  }
  // Most urgent first, keeping a record's years together (year 1 on file,
  // year 2 due) in the order they come. A row is as urgent as the most
  // urgent thing on it, its follower included.
  const keyOf = (item: ChecklistEntry) =>
    `${item.template_code}:${item.license_state ?? ""}`
  const rank = new Map<string, number>()
  for (const item of current) {
    if (folded(item)) continue
    const r = Math.min(
      ...[item, ...(followersOf.get(item.id) ?? [])].map((i) =>
        ORDER.indexOf(i.status)
      )
    )
    rank.set(keyOf(item), Math.min(rank.get(keyOf(item)) ?? r, r))
  }
  const shown = [
    ...current
      .filter((item) => !folded(item))
      .sort((a, b) => (rank.get(keyOf(a)) ?? 0) - (rank.get(keyOf(b)) ?? 0)),
    ...(history ? past.filter((item) => !folded(item)) : []),
  ]
  const counts = new Map<string, number>()
  for (const item of shown) {
    counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1)
  }
  const toDo = current.filter(
    (i) => i.status === "missing" || i.status === "overdue"
  ).length
  const toReview = current.filter((i) => i.status === "pending_review").length

  return (
    <SettingsCard
      title={title}
      description={description}
      className="@container"
      contentClassName="px-0 pb-0"
      action={
        past.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHistory((v) => !v)}
          >
            <History /> {history ? "Hide history" : `History (${past.length})`}
          </Button>
        )
      }
      footer={
        <SettingsCardFooter
          hint={`${toDo} to do · ${toReview} waiting for review`}
        />
      }
    >
      {/* Rows run edge to edge with a line between, like the tables. */}
      <ul className="divide-y border-t">
        {shown.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            followers={followersOf.get(item.id) ?? []}
            showYear={(counts.get(keyOf(item)) ?? 0) > 1}
            rules={rules}
            manager={manager}
            driverName={driverName}
            signerName={signerName}
          />
        ))}
      </ul>
    </SettingsCard>
  )
}
