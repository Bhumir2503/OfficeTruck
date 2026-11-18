"use client"

import { FileText, History, PenLine } from "lucide-react"
import { useState } from "react"

import {
  DATE_STATUSES,
  DqStatusBadge,
  DueDate,
} from "@/components/dq/dq-badges"
import {
  ItemActions,
  VoidSignatureButton,
  type ItemRules,
} from "@/components/dq/item-actions"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import type { ChecklistEntry } from "@/lib/dq/service"

const day = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

/** The line under an item's title: what's on file, or what's due. */
function dateLine(item: ChecklistEntry): React.ReactNode {
  if (item.not_applicable_reason) return item.not_applicable_reason
  if (item.completed_at) {
    const confirmed = item.documents.find((d) => d.confirmed && !d.superseded)
    const on = confirmed?.issue_date ?? item.completed_at
    return (
      <>
        On file, dated {day(on)}
        {item.valid_until && (
          <>
            {" · "}
            <DueDate status={item.status}>
              good until {day(item.valid_until)}
            </DueDate>
          </>
        )}
      </>
    )
  }
  return item.due_date ? (
    <DueDate status={item.status}>Due {day(item.due_date)}</DueDate>
  ) : (
    "Due once the start date is set"
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
      <ul className="@container divide-y border-t">
        {shown.map((item) => {
          // The item's newest file is shown on the upload button instead.
          const onButton =
            manager &&
            item.current &&
            !item.not_applicable_reason &&
            item.evidence !== "contact_log"
              ? item.documents.find((d) => !d.superseded)?.id
              : undefined
          const listed = item.documents.filter(
            (d) => !d.superseded && d.id !== onButton
          )
          return (
            <li
              key={item.id}
              className={`flex flex-col gap-3 px-6 py-4 @xl:flex-row @xl:items-start @xl:justify-between ${item.current ? "" : "bg-muted/30"}`}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {item.title}
                    {item.license_state && ` · ${item.license_state}`}
                  </p>
                  {item.cycle_number > 1 && (
                    <span className="text-xs text-muted-foreground">
                      {item.current
                        ? `Year ${item.cycle_number}`
                        : `Earlier: year ${item.cycle_number}`}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {dateLine(item)}
                </p>
                {(listed.length > 0 || item.signatures.length > 0) && (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm">
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
                          <span className="ml-1 text-xs text-sky-800">
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
                          <span className="ml-1 text-xs">
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
                            signature.type !== "employment_application" && (
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
              <div className="flex shrink-0 flex-col items-start gap-2 @xl:items-end">
                {!DATE_STATUSES.includes(item.status) && (
                  <DqStatusBadge status={item.status} />
                )}
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
        })}
      </ul>
    </SettingsCard>
  )
}
