import { notFound } from "next/navigation"

import { AttentionList } from "@/components/dashboard/attention-list"
import { MonthSnapshot } from "@/components/dashboard/month-snapshot"
import { MovingLoads } from "@/components/dashboard/moving-loads"
import { OnboardingDialog } from "@/components/onboarding-dialog"
import { getAttention, getMovingLoads } from "@/lib/dashboard"
import { balanceDue } from "@/lib/invoice-format"
import { canManage, getOrganization } from "@/lib/organizations"
import { inPeriod, totals } from "@/lib/report-format"
import { getReportLoads } from "@/lib/reports"

const monthName = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: "UTC",
})

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
  const [moving, reportLoads] = await Promise.all([
    getMovingLoads(organization.id, today),
    getReportLoads(organization.id),
  ])

  const month = totals(
    reportLoads.filter((load) => inPeriod(load, "this_month", today))
  )
  let owed = 0
  let overdue = 0
  for (const invoice of invoices) {
    if (invoice.status !== "sent") continue
    const left = balanceDue(invoice.total, invoice.paid_amount)
    owed += left
    if (invoice.due_on && invoice.due_on < today) overdue += left
  }
  const date = new Date(`${today}T00:00:00Z`)

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="grid grid-cols-1 gap-4 px-4 md:gap-6 lg:px-6 @5xl/main:grid-cols-3">
        <div className="flex flex-col gap-4 md:gap-6 @5xl/main:col-span-2">
          <AttentionList items={items} base={base} />
          <MovingLoads loads={moving} loadsBase={`${base}/loads`} />
        </div>
        <div className="flex flex-col gap-4 md:gap-6">
          <MonthSnapshot
            month={month}
            monthName={monthName.format(date)}
            owed={owed}
            overdue={overdue}
            reportsHref={`${base}/reports`}
            invoicesHref={`${base}/invoices`}
          />
        </div>
      </div>
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
