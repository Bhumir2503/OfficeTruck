import { notFound } from "next/navigation"

import { AttentionCard } from "@/components/dashboard/attention-list"
import { MovingLoadsCard } from "@/components/dashboard/moving-loads"
import { OnTheClock } from "@/components/dashboard/on-the-clock"
import { OverviewCharts } from "@/components/dashboard/overview-charts"
import { DeliveredLoadsCard } from "@/components/dashboard/report-tables"
import { StatsStrip } from "@/components/dashboard/stats-strip"
import { OnboardingDialog } from "@/components/onboarding-dialog"
import { getAttention, getMovingLoads, getWaitingStops } from "@/lib/dashboard"
import { balanceDue } from "@/lib/invoice-format"
import { canManage, getOrganization } from "@/lib/organizations"
import { monthToDate } from "@/lib/report-format"
import { getReportLoads } from "@/lib/reports"

/**
 * The dashboard, laid out like shadcnblocks' Dashboard 2: the period and the
 * main actions, revenue and costs, the month's numbers, then the tables.
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
  const { today, items, invoices } = await getAttention(organization.id)
  const [moving, reportLoads, waiting] = await Promise.all([
    getMovingLoads(organization.id, today),
    getReportLoads(organization.id),
    getWaitingStops(organization.id),
  ])

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
      <div className="flex flex-col gap-4 sm:gap-6 xl:flex-row">
        <AttentionCard items={items} base={base} />
        <MovingLoadsCard loads={moving} loadsBase={`${base}/loads`} />
      </div>
      <DeliveredLoadsCard loads={reportLoads} today={today} orgBase={base} />
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
