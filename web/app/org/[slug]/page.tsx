import { notFound } from "next/navigation"

import { AttentionList } from "@/components/dashboard/attention-list"
import { MovingLoads } from "@/components/dashboard/moving-loads"
import { OnTheClock } from "@/components/dashboard/on-the-clock"
import { OverviewCharts } from "@/components/dashboard/overview-charts"
import { PeriodProvider } from "@/components/dashboard/period-context"
import { ReportCards } from "@/components/dashboard/report-cards"
import { StatsStrip } from "@/components/dashboard/stats-strip"
import { OnboardingDialog } from "@/components/onboarding-dialog"
import { getAttention, getMovingLoads, getWaitingStops } from "@/lib/dashboard"
import { balanceDue } from "@/lib/invoice-format"
import { canManage, getOrganization } from "@/lib/organizations"
import { monthToDate } from "@/lib/report-format"
import { today as getToday } from "@/lib/driver-format"
import { getReportLoads } from "@/lib/reports"

/** The first of the month 24 months back: as far as the charts reach. */
function chartsSince(today: string) {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const back = year * 12 + (month - 1) - 23
  return `${Math.floor(back / 12)}-${String((back % 12) + 1).padStart(2, "0")}-01`
}

/**
 * The dashboard, laid out like shadcnblocks' Dashboard 2: the period and the
 * main actions, revenue and costs, the month's numbers, then the day's
 * work and the report tables in their own cards.
 */
export default async function DashboardPage({
  params,
  searchParams,
}: PageProps<"/org/[slug]">) {
  const { slug } = await params
  const { welcome } = await searchParams
  const organization = await getOrganization(slug)
  if (!organization) {
    notFound()
  }

  const base = `/org/${organization.slug}`
  const today = getToday()
  // All at once. The charts go back 24 months at most (a year, against the
  // year before), so older loads aren't read.
  const [{ items, invoices }, moving, reportLoads, waiting] = await Promise.all(
    [
      getAttention(organization.id),
      getMovingLoads(organization.id, today),
      getReportLoads(organization.id, chartsSince(today)),
      getWaitingStops(organization.id),
    ]
  )

  const { current, previous } = monthToDate(reportLoads, today)
  let owed = 0
  let overdue = 0
  let unpaid = 0
  for (const invoice of invoices) {
    if (invoice.status !== "sent") continue
    const left = balanceDue(invoice.total, invoice.paid_amount)
    if (left <= 0) continue
    owed += left
    unpaid += 1
    if (invoice.due_on && invoice.due_on < today) overdue += left
  }

  return (
    <div
      id="reports"
      className="w-full flex-1 scroll-mt-16 space-y-4 p-3 sm:space-y-6 sm:p-4 md:p-6"
    >
      {/* The period tabs at the top set what the charts and Reports show. */}
      <PeriodProvider>
        {/* Only while a driver's waiting at a stop: detention can't wait. */}
        {waiting.length > 0 && (
          <OnTheClock stops={waiting} loadsBase={`${base}/loads`} />
        )}
        <OverviewCharts
          loads={reportLoads}
          today={today}
          inboxHref={`${base}/loads/inbox`}
          newLoadHref={`${base}/loads/new`}
        />
        <StatsStrip
          current={current}
          previous={previous}
          owed={owed}
          overdue={overdue}
          unpaid={unpaid}
          invoicesHref={`${base}/invoices`}
        />
        <div className="grid grid-cols-1 items-stretch gap-4 sm:gap-6 xl:grid-cols-2">
          <AttentionList items={items} base={base} />
          <MovingLoads loads={moving} loadsBase={`${base}/loads`} />
        </div>
        <ReportCards loads={reportLoads} today={today} orgBase={base} />
      </PeriodProvider>
      {/* Set when the organization was just created. */}
      {welcome && canManage(organization) && (
        <OnboardingDialog
          organizationId={organization.id}
          organizationName={organization.name}
        />
      )}
    </div>
  )
}
