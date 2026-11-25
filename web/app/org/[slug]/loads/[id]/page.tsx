import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { LoadAssignmentForm } from "@/components/loads/load-assignment-form"
import { LoadBrokerForm } from "@/components/loads/load-broker-form"
import { LoadChargesCard } from "@/components/loads/load-charges-card"
import { LoadDetailsCard } from "@/components/loads/load-details-card"
import { LoadExpensesCard } from "@/components/loads/load-expenses-card"
import { LoadHistoryCard } from "@/components/loads/load-history-card"
import { LoadSidePanel } from "@/components/loads/load-side-panel"
import { LoadStatusMenu } from "@/components/loads/load-status-menu"
import { LoadStopsCard } from "@/components/loads/load-stops-card"
import { LOAD_TAB_SKELETONS } from "@/components/loads/loads-skeletons"
import {
  LOAD_TAB_LABELS,
  LOAD_TABS,
  loadTabHref,
  parseLoadTab,
} from "@/components/loads/load-tabs"
import {
  PageTabBar,
  PageTabPanel,
  PageTabsProvider,
} from "@/components/page-tabs"
import { buttonVariants } from "@/components/ui/button"
import { getBrokerOptions } from "@/lib/brokers"
import { getLoadEvents } from "@/lib/dispatch"
import { getDriverOptions } from "@/lib/drivers"
import { getFactoringCompany } from "@/lib/factoring"
import { getLoadDocuments } from "@/lib/load-documents"
import { getLoadInvoice } from "@/lib/invoices"
import { getLoadExpenses } from "@/lib/load-expenses"
import { getLoadDetail } from "@/lib/loads"
import { canManage, getOrganization } from "@/lib/organizations"
import { getTruckOptions } from "@/lib/trucks"

async function loadFor(params: PageProps<"/org/[slug]/loads/[id]">["params"]) {
  const { slug, id } = await params
  const organization = await getOrganization(slug)
  const detail = organization ? await getLoadDetail(organization.id, id) : null
  return { organization, detail }
}

export async function generateMetadata({
  params,
}: PageProps<"/org/[slug]/loads/[id]">): Promise<Metadata> {
  const { detail } = await loadFor(params)
  return { title: detail ? `Load ${detail.load.reference}` : "Load not found" }
}

export default async function LoadPage({
  params,
  searchParams,
}: PageProps<"/org/[slug]/loads/[id]">) {
  const { organization, detail } = await loadFor(params)
  if (!organization || !detail) {
    notFound()
  }
  const { load, stops, charges, versions } = detail

  const base = `/org/${organization.slug}/loads`
  const loadHref = `${base}/${load.id}`
  const tab = parseLoadTab((await searchParams).tab)
  const [
    drivers,
    trucks,
    brokers,
    factoring,
    events,
    documents,
    expenses,
    invoice,
  ] = await Promise.all([
    getDriverOptions(organization.id),
    getTruckOptions(organization.id),
    getBrokerOptions(organization.id),
    getFactoringCompany(organization.id),
    getLoadEvents(organization.id, load.id),
    getLoadDocuments(organization.id, load.id),
    getLoadExpenses(organization.id, load.id),
    getLoadInvoice(organization.id, load.id),
  ])

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
          All loads
        </Link>
        <PageTabsProvider>
          <div className="grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1fr)_20rem] @6xl/main:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="flex min-w-0 flex-col gap-6">
              <LoadDetailsCard
                organizationId={organization.id}
                load={load}
                description={
                  load.broker ? (
                    <Link
                      href={`/org/${organization.slug}/customers/${load.broker.id}`}
                      className="hover:underline"
                    >
                      {load.broker_name}
                    </Link>
                  ) : (
                    load.broker_name
                  )
                }
                statusMenu={
                  <LoadStatusMenu
                    organizationId={organization.id}
                    load={load}
                  />
                }
                notice={
                  load.status === "cancelled" && load.cancel_reason ? (
                    <p className="mb-5 rounded-lg bg-muted px-4 py-3 text-sm">
                      <span className="font-medium">Cancelled:</span>{" "}
                      {load.cancel_reason}
                    </p>
                  ) : null
                }
              />
              <PageTabBar
                label="Load sections"
                active={tab}
                tabs={LOAD_TABS.map((t) => ({
                  key: t,
                  label: LOAD_TAB_LABELS[t],
                  href: loadTabHref(loadHref, t),
                }))}
              />
              <PageTabPanel
                active={tab}
                className="flex min-w-0 flex-col gap-6"
                skeletons={LOAD_TAB_SKELETONS}
              >
                {tab === "trip" && (
                  <>
                    <LoadAssignmentForm
                      // Remount when the assignment changes elsewhere (unassigning), so
                      // the pickers don't keep the old truck and driver.
                      key={`${load.truck_id ?? ""}:${load.driver_id ?? ""}`}
                      organizationId={organization.id}
                      load={load}
                      drivers={drivers}
                      driversBase={`/org/${organization.slug}/drivers`}
                      trucks={trucks}
                      trucksBase={`/org/${organization.slug}/equipment`}
                      loadsBase={base}
                      canChangePay={canManage(organization)}
                    />
                    <LoadStopsCard
                      organizationId={organization.id}
                      load={load}
                      stops={stops}
                      billedNotes={charges
                        .filter(
                          (charge) =>
                            charge.kind === "detention" &&
                            charge.description !== null
                        )
                        .map((charge) => charge.description as string)}
                    />
                  </>
                )}
                {tab === "billing" && (
                  <>
                    <LoadBrokerForm
                      organizationId={organization.id}
                      load={load}
                      brokers={brokers}
                      brokersHref={`/org/${organization.slug}/customers`}
                      factoringName={factoring?.name ?? null}
                    />
                    <LoadChargesCard
                      organizationId={organization.id}
                      load={load}
                      charges={charges}
                      versions={versions}
                    />
                  </>
                )}
                {tab === "expenses" && (
                  <LoadExpensesCard
                    organizationId={organization.id}
                    loadId={load.id}
                    expenses={expenses}
                    hasLumperCharge={charges.some(
                      (charge) => charge.kind === "lumper"
                    )}
                  />
                )}
                {tab === "history" && <LoadHistoryCard events={events} />}
              </PageTabPanel>
            </div>
            {/* Beside the cards, what's next stays in view; on a phone it
              comes after them. */}
            <aside className="flex flex-col gap-6 @4xl/main:sticky @4xl/main:top-6 @4xl/main:max-h-[calc(100svh-3rem)] @4xl/main:overflow-y-auto">
              <LoadSidePanel
                organizationId={organization.id}
                load={load}
                charges={charges}
                documents={documents}
                expenses={expenses}
                trucks={trucks}
                drivers={drivers}
                trucksBase={`/org/${organization.slug}/equipment`}
                driversBase={`/org/${organization.slug}/drivers`}
                loadsBase={base}
                invoice={invoice}
                invoicesBase={`/org/${organization.slug}/invoices`}
              />
            </aside>
          </div>
        </PageTabsProvider>
      </div>
    </div>
  )
}
