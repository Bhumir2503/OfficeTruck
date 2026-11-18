import { ChevronRight, PhoneOff } from "lucide-react"
import Link from "next/link"

import {
  DATE_STATUSES,
  DqStatusBadge,
  DueDate,
} from "@/components/dq/dq-badges"
import { DriverItemUpload } from "@/components/dq/driver-item-upload"
import { formatDate, today as getToday } from "@/lib/driver-format"
import type { DqItemStatus } from "@/lib/dq-rules"
import { listChecklist } from "@/lib/dq/service"
import { createClient } from "@/lib/supabase/server"

type MyDriver = {
  organization_id: string
  organization_name: string
  driver_id: string
  full_name: string
}

/** Most pressing first: what's late, missing or due, then the rest. */
const ORDER: DqItemStatus[] = [
  "overdue",
  "missing",
  "due_soon",
  "pending_review",
  "upcoming",
  "complete",
  "not_applicable",
]

/**
 * The driver's own file: each item their carrier needs, what's on file, and
 * a way to photograph or upload what's missing.
 */
export default async function DriverHomePage() {
  const supabase = await createClient()
  await supabase.rpc("claim_driver_logins")
  const { data } = await supabase.rpc("my_dq_drivers")
  const mine = (data ?? []) as MyDriver[]
  const today = getToday()

  if (mine.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-background px-6 py-10 text-center">
        <PhoneOff className="size-8 text-muted-foreground" />
        <p className="font-medium">No driver file for this number yet</p>
        <p className="text-sm text-muted-foreground">
          Ask your carrier to add this phone number to your driver profile, then
          sign in again.
        </p>
      </div>
    )
  }

  const files = await Promise.all(
    mine.map(async (driver) => ({
      driver,
      checklist: await listChecklist(supabase, driver.driver_id, today),
    }))
  )

  return (
    <div className="flex flex-col gap-8">
      {files.map(({ driver, checklist }) => {
        const items = checklist.ok
          ? checklist.data.items
              .filter((item) => item.current && item.file_type === "dq")
              .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
          : []
        const todo = items.filter((i) =>
          ["overdue", "missing", "due_soon"].includes(i.status)
        ).length
        return (
          <section key={driver.driver_id} className="flex flex-col gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {driver.organization_name}
              </p>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-brand-ink">
                {todo === 0
                  ? "You're all caught up"
                  : `${todo} ${todo === 1 ? "thing needs" : "things need"} you`}
              </h1>
            </div>
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Your carrier hasn&apos;t set up your file yet.
              </p>
            )}
            <ul className="flex flex-col gap-3">
              {items.map((item) => {
                const open = !item.completed_at && !item.not_applicable_reason
                const application =
                  item.template_code === "employment_application"
                return (
                  <li
                    key={item.id}
                    className="rounded-xl border bg-background p-4 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium">
                          {item.title}
                          {item.license_state && ` · ${item.license_state}`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {item.completed_at ? (
                            item.valid_until ? (
                              <DueDate status={item.status}>
                                Good until {formatDate(item.valid_until)}
                              </DueDate>
                            ) : (
                              "On file"
                            )
                          ) : item.status === "pending_review" ? (
                            "Sent. Your carrier will check it."
                          ) : item.due_date ? (
                            <DueDate status={item.status}>
                              Due {formatDate(item.due_date)}
                            </DueDate>
                          ) : (
                            "Needed"
                          )}
                        </p>
                      </div>
                      {!DATE_STATUSES.includes(item.status) && (
                        <DqStatusBadge status={item.status} />
                      )}
                    </div>
                    {open && application && (
                      <Link
                        href={`/driver/application/${item.id}`}
                        className="mt-3 flex h-11 items-center justify-between rounded-lg bg-brand px-4 text-sm font-medium text-white"
                      >
                        {item.signatures.length
                          ? "View your application"
                          : "Fill in and sign"}
                        <ChevronRight className="size-4" />
                      </Link>
                    )}
                    {open &&
                      !application &&
                      item.evidence !== "attestation" && (
                        <DriverItemUpload itemId={item.id} />
                      )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
