import { ArrowRight, ClipboardList, Download, Lock } from "lucide-react"
import Link from "next/link"

import { DriverDqBadge } from "@/components/dq/dq-badges"
import { DqChecklist } from "@/components/dq/dq-checklist"
import type { DriverFacts } from "@/components/dq/driver-facts"
import {
  EmployerChecks,
  type EmployerCheck,
} from "@/components/dq/employer-checks"
import type { ItemRules } from "@/components/dq/item-actions"
import {
  SettingsCard,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { buttonVariants } from "@/components/ui/button"
import { formatDate } from "@/lib/driver-format"
import { listChecklist, loadTemplates } from "@/lib/dq/service"
import { getUser } from "@/lib/organizations"
import { createClient } from "@/lib/supabase/server"

const FILES = [
  {
    type: "dq",
    title: "Driver qualification file",
    description: "The records every driver needs on file.",
  },
  {
    type: "investigation",
    title: "Investigation history file",
    description: "Safety performance history from previous employers.",
  },
  {
    type: "drug_alcohol",
    title: "Drug and alcohol file",
    description: "Pre-employment test and Clearinghouse records.",
  },
] as const

/** Where links to a driver's qualification file jump to on their page. */
export const DRIVER_FILE_ID = "qualification-file"

/** "2026-11-30" → "2029-11-30": the end of the 3 years a file is kept. */
const plusThreeYears = (date: string) =>
  `${Number(date.slice(0, 4)) + 3}${date.slice(4)}`

export type DqFile = Awaited<ReturnType<typeof loadDqFile>>

/**
 * Everything the driver page shows about the qualification file, loaded
 * once for both the side panel's summary and the checklists.
 */
export async function loadDqFile({
  driverId,
  organizationId,
  manager,
  today,
}: {
  driverId: string
  organizationId: string
  manager: boolean
  today: string
}) {
  const supabase = await createClient()
  const user = await getUser()
  const [{ data }, checklist, templates, checks, profile] = await Promise.all([
    supabase
      .from("drivers")
      .select(
        "id, full_name, license_class, cdl_state, prior_license_states, start_date, end_date, holds_medical_variance, login_phone, user_id"
      )
      .eq("organization_id", organizationId)
      .eq("id", driverId)
      .single(),
    listChecklist(supabase, driverId, today),
    loadTemplates(supabase),
    manager
      ? supabase
          .from("dq_employer_checks")
          .select(
            "id, employer_name, employer_address, contacted_at, method, outcome, response_summary"
          )
          .eq("driver_id", driverId)
          .is("removed_at", null)
          .order("contacted_at", { ascending: false })
      : null,
    user
      ? supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.sub)
          .maybeSingle()
      : null,
  ])
  if (!data || !checklist.ok) {
    throw new Error("The driver's file couldn't be loaded.")
  }
  const { user_id, ...row } = data as Omit<DriverFacts, "linked"> & {
    user_id: string | null
  }
  const rules: Record<string, ItemRules> = Object.fromEntries(
    templates.map((t) => [
      t.code,
      {
        needsExpiry: t.max_validity_months !== null,
        needsQueryResult: templates.some(
          (other) => other.trigger_code === t.code
        ),
      },
    ])
  )
  const driver: DriverFacts = { ...row, linked: !!user_id }
  return {
    driver,
    manager,
    items: checklist.data.items,
    status: checklist.data.status,
    rules,
    checks: (checks?.data ?? []) as EmployerCheck[],
    frozen: !!driver.end_date && driver.end_date < today,
    signerName:
      (profile?.data as { full_name: string | null } | null)?.full_name ?? "",
  }
}

/**
 * The side panel's qualification file box: its status, the dates that
 * matter, and the exports. The restricted files export on their own, for
 * owners and admins only.
 */
export function DqFileSummary({
  file,
  href,
}: {
  file: DqFile
  /** The driver page's file tab, when the summary is shown elsewhere. */
  href?: string
}) {
  const { driver, manager, items, status, frozen } = file
  const exportBase = `/api/dq/drivers/${driver.id}/export`
  const restricted = FILES.filter(
    (f) => f.type !== "dq" && items.some((item) => item.file_type === f.type)
  )
  return (
    <section className="shrink-0 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
      <div className="flex flex-col gap-3 px-5 pt-4 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold">Qualification file</h4>
          <DriverDqBadge status={status} />
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            {driver.start_date
              ? `Started ${formatDate(driver.start_date)}`
              : "No start date yet"}
          </p>
          {driver.end_date && (
            <p>
              Left {formatDate(driver.end_date)}, kept until{" "}
              {formatDate(plusThreeYears(driver.end_date))}
            </p>
          )}
          {frozen && (
            <p className="inline-flex items-center gap-1.5">
              <Lock className="size-4" /> Read-only: this driver has left.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {href && (
            <Link
              href={href}
              scroll={false}
              className={buttonVariants({ className: "w-full" })}
            >
              Open the file <ArrowRight />
            </Link>
          )}
          <a
            href={`${exportBase}?file=dq`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({
              variant: href ? "outline" : "default",
              className: "w-full",
            })}
          >
            <Download /> Export file
          </a>
          {manager &&
            restricted.map((f) => (
              <a
                key={f.type}
                href={`${exportBase}?file=${f.type}`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({
                  variant: "outline",
                  size: "sm",
                  className: "w-full",
                })}
              >
                <Download /> {f.title}
              </a>
            ))}
        </div>
        <p className="text-xs text-muted-foreground">
          OfficeTruck organizes these records. It does not certify that a
          carrier meets federal rules.
        </p>
      </div>
    </section>
  )
}

/**
 * The qualification file in the driver page's main column: each item with
 * its status and actions, and the previous-employer contact log.
 */
export function DqFileSection({ file }: { file: DqFile }) {
  const { driver, manager, items, rules, checks, frozen, signerName } = file
  return (
    <div className="flex flex-col gap-4">
      {FILES.map((f) => {
        const fileItems = items.filter((item) => item.file_type === f.type)
        if (!fileItems.length) {
          return null
        }
        return (
          <div key={f.type} className="flex flex-col gap-4">
            <DqChecklist
              title={f.title}
              description={f.description}
              items={fileItems}
              rules={rules}
              manager={manager && !frozen}
              driverName={driver.full_name}
              signerName={signerName}
            />
            {f.type === "investigation" && manager && (
              <EmployerChecks
                driverId={driver.id}
                checks={checks}
                frozen={frozen}
              />
            )}
          </div>
        )
      })}

      {items.length === 0 && (
        <SettingsCard
          title="Driver qualification file"
          description="The records every driver needs on file."
        >
          <SettingsEmptyState icon={ClipboardList} title="Not set up yet">
            {manager
              ? "Set the start date in Driver details and save to build this driver's checklist."
              : "This driver's file hasn't been set up yet."}
          </SettingsEmptyState>
        </SettingsCard>
      )}
    </div>
  )
}
