import { cn } from "cn"
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  Plus,
} from "lucide-react"
import Link from "next/link"

import { ExpiryBadge } from "@/components/drivers/driver-badges"
import { DriverStatusButton } from "@/components/drivers/driver-status-button"
import { Panel } from "@/components/side-panel"
import { buttonVariants } from "@/components/ui/button"
import {
  DRIVER_CDL_ID,
  driverNextStep,
  formatDate,
  needsAction,
  type ComplianceItem,
} from "@/lib/driver-format"
import type { Driver, DriverDocument, DriverLoad } from "@/lib/drivers"

/** Where the document links go. */
export const DRIVER_DOCUMENTS_ID = "documents"

function ItemIcon({ item, warn }: { item: ComplianceItem; warn: boolean }) {
  const state = item.expiry.state
  if (state === "missing") {
    return <Circle className="size-4 shrink-0 text-muted-foreground" />
  }
  if (warn && state === "expired") {
    return <AlertTriangle className="size-4 shrink-0 text-destructive" />
  }
  if (warn && needsAction(state)) {
    return (
      <Clock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
    )
  }
  return (
    <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
  )
}

/**
 * The right-hand side of the driver page: the one thing to do about them
 * now and whether their paperwork is current.
 */
export function DriverSidePanel({
  organizationId,
  driver,
  items,
  documents,
  loads,
  manager,
  loadsBase,
}: {
  organizationId: string
  driver: Driver
  items: ComplianceItem[]
  documents: Pick<DriverDocument, "kind">[]
  loads: DriverLoad[]
  manager: boolean
  /** /org/<slug>/loads */
  loadsBase: string
}) {
  const step = driverNextStep(driver, items, loads)
  const action = step.action
  // Inactive drivers aren't driving, so their dates don't need warnings.
  const warn = driver.status === "active"
  const current = items.every((item) => item.expiry.state === "ok")
  const photos = [
    { label: "CDL copy", kind: "cdl" },
    { label: "Medical card copy", kind: "medical_card" },
  ].map((photo) => ({
    label: photo.label,
    onFile: documents.some((doc) => doc.kind === photo.kind),
  }))

  return (
    <div className="flex flex-col gap-4">
      {/* Needs attention */}
      <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
        <div className="px-5 pt-4 pb-5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Needs attention
          </p>
          <h4 className="mt-1 text-lg font-semibold tracking-tight">
            {step.title}
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">{step.detail}</p>
          {action?.type === "load" && (
            <Link
              href={`${loadsBase}/${action.id}`}
              className={buttonVariants({
                size: "lg",
                className: "mt-4 w-full",
              })}
            >
              Open load {action.reference} <ArrowRight />
            </Link>
          )}
          {action?.type === "new_load" && manager && (
            <Link
              href={`${loadsBase}/new`}
              className={buttonVariants({
                size: "lg",
                className: "mt-4 w-full",
              })}
            >
              <Plus /> New load
            </Link>
          )}
          {action?.type === "edit" && manager && (
            <a
              href={`#${action.target === "cdl" ? DRIVER_CDL_ID : "qualification-file"}`}
              className={buttonVariants({
                size: "lg",
                className: "mt-4 w-full",
              })}
            >
              <CalendarClock /> {action.label}
            </a>
          )}
          {action?.type === "activate" && manager && (
            <div className="mt-4">
              <DriverStatusButton
                organizationId={organizationId}
                driver={{
                  id: driver.id,
                  full_name: driver.full_name,
                  status: driver.status,
                }}
              />
            </div>
          )}
        </div>
      </section>

      {/* Compliance */}
      <Panel
        title="Compliance"
        aside={
          warn &&
          current && (
            <span className="inline-flex h-6 items-center rounded-4xl bg-emerald-500/15 px-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              All current
            </span>
          )
        }
      >
        <ul className="flex flex-col divide-y">
          {items.map((item) => (
            <li key={item.key} className="py-2.5 first:pt-0">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <ItemIcon item={item} warn={warn} />
                  <span
                    className={cn(
                      "truncate font-medium",
                      !item.due && "text-muted-foreground"
                    )}
                  >
                    {item.label}
                  </span>
                </span>
                {!item.due ? (
                  <span className="text-xs text-muted-foreground">Not set</span>
                ) : warn && needsAction(item.expiry.state) ? (
                  <ExpiryBadge item={item} />
                ) : (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {item.kind === "expires" ? "Expires" : "Due"}{" "}
                    {formatDate(item.due)}
                  </span>
                )}
              </div>
              {item.kind === "due" && (
                <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
                  {item.last
                    ? `Last done ${formatDate(item.last)}`
                    : "Not done yet"}
                </p>
              )}
            </li>
          ))}
          {photos.map((photo) => (
            <li
              key={photo.label}
              className="flex items-center justify-between gap-3 py-2.5 text-sm last:pb-0"
            >
              <span className="flex items-center gap-2">
                {photo.onFile ? (
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    "font-medium",
                    !photo.onFile && "text-muted-foreground"
                  )}
                >
                  {photo.label}
                </span>
              </span>
              <a
                href={`#${DRIVER_DOCUMENTS_ID}`}
                className="text-xs font-medium hover:underline"
              >
                {photo.onFile ? "View" : manager ? "Upload" : "Not on file"}
              </a>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
