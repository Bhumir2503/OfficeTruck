"use client"

import { cn } from "cn"
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  History,
  Hourglass,
  MinusCircle,
  PenLine,
} from "lucide-react"
import { useState } from "react"

import {
  DATE_STATUSES,
  DqStatusBadge,
  DueDate,
} from "@/components/dq/dq-badges"
import {
  ItemActions,
  takesUploads,
  VoidSignatureButton,
  type ItemRules,
} from "@/components/dq/item-actions"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
    upcoming: { tile: "bg-brand/10 text-brand", icon: CheckCircle2 },
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

/** The line under an item's title: what's on file, or which year it is. */
function itemNote(item: ChecklistEntry): React.ReactNode {
  if (item.not_applicable_reason) return item.not_applicable_reason
  const year =
    item.cycle_number > 1
      ? item.current
        ? `Year ${item.cycle_number}`
        : `Earlier: year ${item.cycle_number}`
      : null
  if (item.completed_at) {
    const confirmed = item.documents.find((d) => d.confirmed && !d.superseded)
    const on = confirmed?.issue_date ?? item.completed_at
    return [year, `On file, dated ${day(on)}`].filter(Boolean).join(" · ")
  }
  // The Due column shows a badge rather than the date for these, so the
  // date goes here.
  const dated = DATE_STATUSES.includes(item.status)
  const due = !item.due_date
    ? "Due once the start date is set"
    : dated
      ? "Not on file yet"
      : `Due ${day(item.due_date)}`
  return [year, due].filter(Boolean).join(" · ")
}

/**
 * When it's due or good until, colored by status, or its status when the
 * date isn't what matters (waiting for review, missing, not needed).
 */
function DueCell({ item }: { item: ChecklistEntry }) {
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

export function DqChecklist({
  title,
  description,
  items,
  rules,
  manager,
  driverName,
  signerName,
  children,
}: {
  title: string
  description: string
  items: ChecklistEntry[]
  rules: Record<string, ItemRules>
  manager: boolean
  driverName: string
  signerName: string
  /** More of the file, below the items (the employer contact log). */
  children?: React.ReactNode
}) {
  const [history, setHistory] = useState(false)
  const past = items.filter((item) => !item.current).length
  const shown = history ? items : items.filter((item) => item.current)

  return (
    <SettingsCard
      title={title}
      description={description}
      contentClassName="px-0 pb-0"
      action={
        past > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHistory((v) => !v)}
          >
            <History /> {history ? "Hide history" : `History (${past})`}
          </Button>
        )
      }
      footer={
        <SettingsCardFooter
          hint={`${items.filter((i) => i.current && (i.status === "missing" || i.status === "overdue")).length} to do · ${items.filter((i) => i.current && i.status === "pending_review").length} waiting for review`}
        />
      }
    >
      <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
        <TableHeader className="bg-muted/40">
          <TableRow>
            {/* Item takes the spare width; the rest fit their contents. */}
            <TableHead className="w-full">Item</TableHead>
            <TableHead className="hidden w-px whitespace-nowrap sm:table-cell">
              Due
            </TableHead>
            {manager && (
              <TableHead className="w-px">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((item) => {
            // The item's newest file is shown on the upload button instead.
            const onButton =
              manager &&
              item.current &&
              !item.not_applicable_reason &&
              takesUploads(item)
                ? item.documents.find((d) => !d.superseded)?.id
                : undefined
            const listed = item.documents.filter(
              (d) => !d.superseded && d.id !== onButton
            )
            const { tile, icon: Icon } = TILES[item.status]
            return (
              <TableRow
                key={item.id}
                className={item.current ? undefined : "bg-muted/30"}
              >
                <TableCell className="py-3 whitespace-normal">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-md",
                        tile
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium">
                        {item.title}
                        {item.license_state && ` · ${item.license_state}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {itemNote(item)}
                      </p>
                      {/* The Due column is hidden on a phone. */}
                      <div className="pt-0.5 sm:hidden">
                        <DueCell item={item} />
                      </div>
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
                                <span className="ml-1 text-sky-800">
                                  (not confirmed)
                                </span>
                              )}
                            </li>
                          ))}
                          {item.signatures.map((signature) =>
                            signature.voided_at ? (
                              <li
                                key={signature.id}
                                className="text-muted-foreground"
                              >
                                <span className="inline-flex items-center gap-1 line-through">
                                  <PenLine className="size-3.5" />
                                  Signed by {signature.signer_name},{" "}
                                  {day(signature.signed_at)}
                                </span>
                                <span className="ml-1">
                                  Void: {signature.void_reason}
                                </span>
                              </li>
                            ) : (
                              <li
                                key={signature.id}
                                className="flex items-center gap-2"
                              >
                                <a
                                  href={signature.url ?? undefined}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-brand hover:underline"
                                >
                                  <PenLine className="size-3.5" />
                                  Signed by {signature.signer_name},{" "}
                                  {day(signature.signed_at)}
                                </a>
                                {manager &&
                                  item.current &&
                                  signature.type !==
                                    "employment_application" && (
                                    <VoidSignatureButton
                                      signatureId={signature.id}
                                      label={`the ${item.title.toLowerCase()}`}
                                    />
                                  )}
                              </li>
                            )
                          )}
                        </ul>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden py-3 align-top sm:table-cell">
                  <DueCell item={item} />
                </TableCell>
                {manager && (
                  <TableCell className="py-3 align-top">
                    <div className="flex justify-end">
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
                    </div>
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {children}
    </SettingsCard>
  )
}
