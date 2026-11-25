import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import {
  DqFileSection,
  DqFileSummary,
  loadDqFile,
} from "@/components/dq/dq-file-section"
import { DriverStatusBadge } from "@/components/drivers/driver-badges"
import { DriverDocuments } from "@/components/drivers/driver-documents"
import { DriverForm } from "@/components/drivers/driver-form"
import { DriverLoads } from "@/components/drivers/driver-loads"
import { DriverNotes } from "@/components/drivers/driver-notes"
import { DriverPay } from "@/components/drivers/driver-pay"
import {
  DRIVER_DOCUMENTS_ID,
  DriverSidePanel,
} from "@/components/drivers/driver-side-panel"
import { DriverStatusMenu } from "@/components/drivers/driver-status-menu"
import { DriverFormSkeleton } from "@/components/drivers/drivers-skeletons"
import { PayHistory } from "@/components/drivers/pay-history"
import {
  DRIVER_TAB_LABELS,
  DRIVER_TABS,
  driverTabHref,
  parseDriverTab,
} from "@/components/drivers/driver-tabs"
import {
  PageTabBar,
  PageTabPanel,
  PageTabsProvider,
} from "@/components/page-tabs"
import { TableCardSkeleton, TabSkeleton } from "@/components/tab-skeletons"
import { buttonVariants } from "@/components/ui/button"
import {
  complianceItems,
  dqComplianceDates,
  formatPay,
  today as getToday,
} from "@/lib/driver-format"
import { getDriver, getDriverLoads, getDriverDocuments } from "@/lib/drivers"
import { canManage, getOrganization } from "@/lib/organizations"
import { formatPhone } from "@/lib/phone"
import { parsePeriod, periodOf, shiftPeriod } from "@/lib/settlement-format"
import {
  getOldestUnpaidDay,
  getPaidWeeks,
  getSettlement,
} from "@/lib/settlements"

async function driverFor(
  params: PageProps<"/org/[slug]/drivers/[id]">["params"]
) {
  const { slug, id } = await params
  const organization = await getOrganization(slug)
  const driver = organization ? await getDriver(organization.id, id) : null
  return { organization, driver }
}

export async function generateMetadata({
  params,
}: PageProps<"/org/[slug]/drivers/[id]">): Promise<Metadata> {
  const { driver } = await driverFor(params)
  return { title: driver ? driver.full_name : "Driver not found" }
}

export default async function DriverPage({
  params,
  searchParams,
}: PageProps<"/org/[slug]/drivers/[id]">) {
  const { organization, driver } = await driverFor(params)
  if (!organization || !driver) {
    notFound()
  }

  const base = `/org/${organization.slug}/drivers`
  const driverHref = `${base}/${driver.id}`
  const manager = canManage(organization)
  // Payment is owners and admins only, so members don't get its tab.
  const tabs = DRIVER_TABS.filter((t) => t !== "pay" || manager)
  const query = await searchParams
  const requested = parseDriverTab(query.tab)
  const tab = tabs.includes(requested) ? requested : "overview"
  const today = getToday()
  const loadsBase = `/org/${organization.slug}/loads`
  const currentRate = formatPay(driver.pay_type, driver.pay_rate)
  // Payment: the statement covers the driver's pay period (a week, 2 weeks
  // or a month). By default, the oldest one with delivered loads still
  // unpaid (the current one included), so money owed isn't missed; else
  // the last full one, the one payroll usually covers.
  const period = driver.pay_period
  const thisWeek = periodOf(today, period)
  const payHref = `${driverHref}?tab=pay`
  const onPayment = tab === "pay"
  const chosen = parsePeriod(query.week, period)
  const unpaidSince =
    onPayment && !chosen
      ? await getOldestUnpaidDay(organization.id, driver.id, today)
      : null
  const week =
    chosen ??
    (unpaidSince
      ? periodOf(unpaidSince, period)
      : shiftPeriod(thisWeek, period, -1))
  const [loads, documents, dqFile, settlement, paidWeeks] = await Promise.all([
    getDriverLoads(organization.id, driver.id),
    getDriverDocuments(organization.id, driver.id),
    loadDqFile({
      driverId: driver.id,
      organizationId: organization.id,
      manager,
      today,
    }),
    onPayment
      ? getSettlement(
          organization.id,
          driver.id,
          week,
          period,
          // From a Pay history link: the paid period's own last day.
          typeof query.end === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.end)
            ? query.end
            : null
        )
      : null,
    onPayment ? getPaidWeeks(organization.id, driver.id) : [],
  ])
  // Booked loads still locked at a rate other than the driver's current one.
  const staleLoads = loads
    .filter(
      (load) =>
        (load.status === "booked" || load.status === "dispatched") &&
        currentRate !== null &&
        formatPay(load.driver_pay_type, load.driver_pay_rate) !== currentRate
    )
    .map((load) => ({
      reference: load.reference,
      locked:
        formatPay(load.driver_pay_type, load.driver_pay_rate) ?? "no rate",
    }))
  const items = complianceItems(driver, dqComplianceDates(dqFile.items), today)
  const contact = [
    driver.cdl_number
      ? `CDL ${driver.cdl_number}${driver.cdl_state ? ` · ${driver.cdl_state}` : ""}`
      : "No CDL on file",
    driver.phone && (
      <a key="phone" href={`tel:${driver.phone}`} className="hover:underline">
        {formatPhone(driver.phone)}
      </a>
    ),
    driver.email && (
      <a
        key="email"
        href={`mailto:${driver.email}`}
        className="hover:underline"
      >
        {driver.email}
      </a>
    ),
  ].filter(Boolean)

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Link
          href={base}
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-ml-2 w-fit",
          })}
        >
          <ArrowLeft />
          All drivers
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-tight">
                {driver.full_name}
              </h2>
              <DriverStatusBadge
                status={driver.status}
                className={
                  driver.status === "active" ? "bg-emerald-500/15" : undefined
                }
              />
            </div>
            <p className="flex flex-wrap gap-x-1.5 text-sm text-muted-foreground">
              {contact.map((part, index) => (
                <span key={index}>
                  {index > 0 && <span aria-hidden>· </span>}
                  {part}
                </span>
              ))}
            </p>
          </div>
          {manager && (
            <DriverStatusMenu
              organizationId={organization.id}
              driver={{
                id: driver.id,
                full_name: driver.full_name,
                status: driver.status,
                start_date: driver.start_date,
                end_date: driver.end_date,
              }}
              listHref={base}
              today={today}
            />
          )}
        </div>
        <PageTabsProvider>
          <PageTabBar
            label="Driver sections"
            active={tab}
            tabs={tabs.map((t) => ({
              key: t,
              label: DRIVER_TAB_LABELS[t],
              href: driverTabHref(driverHref, t),
            }))}
          />
          <div className="grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1fr)_20rem] @6xl/main:grid-cols-[minmax(0,1fr)_24rem]">
            <PageTabPanel
              active={tab}
              className="flex min-w-0 flex-col gap-4"
              skeletons={DRIVER_TAB_SKELETONS}
            >
              {/* Overview and Pay are cards of one form. Both tabs render all
                of it, hiding the other tab's cards, so a save always sends
                every field and never blanks the hidden ones. */}
              {manager && (tab === "overview" || tab === "pay") && (
                <DriverForm
                  organizationId={organization.id}
                  base={base}
                  driver={driver}
                  cdlCopy={documents.find((doc) => doc.kind === "cdl") ?? null}
                  staleRate={
                    currentRate && staleLoads.length
                      ? { currentRate, stale: staleLoads }
                      : null
                  }
                  medicalCopy={
                    documents.find((doc) => doc.kind === "medical_card") ?? null
                  }
                  cardClassName={
                    tab === "pay"
                      ? {
                          details: "hidden",
                          cdl: "hidden",
                          medical: "hidden",
                          // How they're paid comes first, then the week's
                          // statement and what's been paid.
                          pay: "order-1",
                        }
                      : { details: "", cdl: "", medical: "", pay: "hidden" }
                  }
                />
              )}
              {onPayment && (
                <>
                  {settlement && (
                    <div id="pay" className="order-2 scroll-mt-6">
                      <DriverPay
                        organizationId={organization.id}
                        settlement={settlement}
                        today={today}
                        loadsBase={loadsBase}
                        prevHref={`${payHref}&week=${shiftPeriod(week, period, -1)}#pay`}
                        nextHref={
                          week < thisWeek
                            ? `${payHref}&week=${shiftPeriod(week, period, 1)}#pay`
                            : null
                        }
                      />
                    </div>
                  )}
                  <div className="order-3">
                    <PayHistory
                      weeks={paidWeeks}
                      payHref={payHref}
                      today={today}
                    />
                  </div>
                </>
              )}
              {tab === "loads" && (
                <DriverLoads loads={loads} loadsBase={loadsBase} />
              )}
              {tab === "documents" && (
                <DriverDocuments
                  id={DRIVER_DOCUMENTS_ID}
                  organizationId={organization.id}
                  driverId={driver.id}
                  documents={documents}
                  dates={driver}
                  canManage={manager}
                  warn={driver.status === "active"}
                  today={today}
                />
              )}
              {tab === "file" && <DqFileSection file={dqFile} />}
            </PageTabPanel>
            {/* Beside the cards, what's next stays in view; on a phone it
              comes first. */}
            <aside className="order-first flex flex-col gap-4 @4xl/main:sticky @4xl/main:top-6 @4xl/main:order-none @4xl/main:max-h-[calc(100svh-3rem)] @4xl/main:overflow-y-auto">
              <DriverSidePanel
                organizationId={organization.id}
                driver={driver}
                items={items}
                loads={loads}
                manager={manager}
                loadsBase={loadsBase}
                documentKinds={documents.map((doc) => doc.kind)}
                driverHref={driverHref}
              />
              <DqFileSummary
                file={dqFile}
                href={
                  tab === "file" ? undefined : driverTabHref(driverHref, "file")
                }
              />
              <DriverNotes
                organizationId={organization.id}
                driverId={driver.id}
                notes={driver.notes}
                canManage={manager}
              />
            </aside>
          </div>
        </PageTabsProvider>
      </div>
    </div>
  )
}

/** Each tab's cards while it loads. */
const DRIVER_TAB_SKELETONS = {
  overview: (
    <TabSkeleton>
      <DriverFormSkeleton editing />
    </TabSkeleton>
  ),
  pay: (
    <TabSkeleton>
      <TableCardSkeleton title="Pay statement" rows={2} />
      <TableCardSkeleton title="Pay history" rows={2} />
    </TabSkeleton>
  ),
  loads: (
    <TabSkeleton>
      <TableCardSkeleton title="Loads" rows={5} />
    </TabSkeleton>
  ),
  documents: (
    <TabSkeleton>
      <TableCardSkeleton title="Documents" />
    </TabSkeleton>
  ),
  file: (
    <TabSkeleton>
      <TableCardSkeleton title="Driver qualification file" rows={6} />
      <TableCardSkeleton title="Investigation history file" rows={2} />
      <TableCardSkeleton title="Drug and alcohol file" rows={4} />
    </TabSkeleton>
  ),
}
