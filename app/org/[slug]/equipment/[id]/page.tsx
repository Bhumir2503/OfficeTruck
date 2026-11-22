import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { TruckStatusBadge } from "@/components/trucks/truck-badges"
import { TruckDocuments } from "@/components/trucks/truck-documents"
import { TruckForm } from "@/components/trucks/truck-form"
import { TruckMaintenance } from "@/components/trucks/truck-maintenance"
import {
  TRUCK_MAINTENANCE_ID,
  TruckNextAction,
} from "@/components/trucks/truck-next-action"
import { TruckNotes } from "@/components/trucks/truck-notes"
import { TruckStatusMenu } from "@/components/trucks/truck-status-menu"
import { TruckSummary } from "@/components/trucks/truck-summary"
import {
  PageTabBar,
  PageTabPanel,
  PageTabsProvider,
} from "@/components/page-tabs"
import {
  FieldsCardSkeleton,
  TableCardSkeleton,
  TabSkeleton,
} from "@/components/tab-skeletons"
import {
  TRUCK_TAB_LABELS,
  TRUCK_TABS,
  parseTruckTab,
  truckTabHref,
} from "@/components/trucks/truck-tabs"
import { buttonVariants } from "@/components/ui/button"
import { formatDate, today as getToday } from "@/lib/driver-format"
import { getDriverOptions } from "@/lib/drivers"
import { canManage, getOrganization } from "@/lib/organizations"
import {
  pmStatus,
  withEstimatedOdometer,
  truckComplianceItems,
  truckDescription,
} from "@/lib/truck-format"
import {
  getMilesSinceReading,
  getTruck,
  getTruckDocuments,
  getTruckMaintenance,
} from "@/lib/trucks"

async function truckFor(
  params: PageProps<"/org/[slug]/equipment/[id]">["params"]
) {
  const { slug, id } = await params
  const organization = await getOrganization(slug)
  const truck = organization ? await getTruck(organization.id, id) : null
  return { organization, truck }
}

export async function generateMetadata({
  params,
}: PageProps<"/org/[slug]/equipment/[id]">): Promise<Metadata> {
  const { truck } = await truckFor(params)
  return { title: truck ? truck.unit_number : "Truck not found" }
}

export default async function TruckPage({
  params,
  searchParams,
}: PageProps<"/org/[slug]/equipment/[id]">) {
  const { organization, truck } = await truckFor(params)
  if (!organization || !truck) {
    notFound()
  }

  const base = `/org/${organization.slug}/equipment`
  const manager = canManage(organization)
  const truckHref = `${base}/${truck.id}`
  const tab = parseTruckTab((await searchParams).tab)
  const today = getToday()
  const warn = truck.status === "active"
  // The This week and Loads cards are set aside for now.
  const [drivers, documents, maintenance, milesSince] = await Promise.all([
    manager ? getDriverOptions(organization.id) : Promise.resolve([]),
    getTruckDocuments(organization.id, truck.id),
    getTruckMaintenance(organization.id, truck.id),
    getMilesSinceReading(organization.id, [truck]),
  ])
  // Service by mileage counts from the odometer estimated from loads run
  // since the last reading.
  const since = milesSince[truck.id]
  const estimated = withEstimatedOdometer(truck, since)
  const items = truckComplianceItems(truck, today)
  const lastPm = maintenance.find((entry) => entry.kind === "preventive")
  const pm = pmStatus(
    estimated,
    lastPm ? { done_on: lastPm.done_on, odometer: lastPm.odometer } : null,
    today
  )
  const description = truckDescription(truck)

  const subtitle = [
    description,
    truck.vin && `VIN ${truck.vin}`,
    truck.plate_number &&
      `Plate ${truck.plate_number}${truck.plate_state ? ` · ${truck.plate_state}` : ""}`,
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
          All trucks
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-tight">
                {truck.unit_number}
              </h2>
              <TruckStatusBadge
                status={truck.status}
                className={
                  truck.status === "active" ? "bg-emerald-500/15" : undefined
                }
              />
            </div>
            <p className="flex flex-wrap gap-x-1.5 text-sm text-muted-foreground">
              {subtitle.length
                ? subtitle.map((part, index) => (
                    <span key={index}>
                      {index > 0 && <span aria-hidden>· </span>}
                      {part}
                    </span>
                  ))
                : "No details yet"}
            </p>
          </div>
          {manager && (
            <TruckStatusMenu
              organizationId={organization.id}
              truck={truck}
              listHref={base}
            />
          )}
        </div>
        <PageTabsProvider>
          <PageTabBar
            label="Truck sections"
            active={tab}
            tabs={TRUCK_TABS.map((t) => ({
              key: t,
              label: TRUCK_TAB_LABELS[t],
              href: truckTabHref(truckHref, t),
            }))}
          />
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
            <PageTabPanel
              active={tab}
              className="flex min-w-0 flex-col gap-4"
              skeletons={TRUCK_TAB_SKELETONS}
            >
              {tab === "overview" &&
                (manager ? (
                  <TruckForm
                    organizationId={organization.id}
                    base={base}
                    drivers={drivers}
                    truck={truck}
                    cards={["details", "plate", "ownership"]}
                  />
                ) : (
                  <TruckSummary
                    truck={truck}
                    items={items}
                    warn={warn}
                    driversBase={`/org/${organization.slug}/drivers`}
                  />
                ))}
              {tab === "maintenance" && manager && (
                <TruckForm
                  organizationId={organization.id}
                  base={base}
                  drivers={drivers}
                  truck={truck}
                  cards={["maintenance"]}
                />
              )}
              {tab === "maintenance" && (
                <div id={TRUCK_MAINTENANCE_ID} className="scroll-mt-6">
                  <TruckMaintenance
                    organizationId={organization.id}
                    truckId={truck.id}
                    entries={maintenance}
                    pm={pm}
                    printHref={`/print/${organization.slug}/trucks/${truck.id}/maintenance`}
                    odometerNote={
                      since?.miles && truck.odometer !== null
                        ? `Odometer ≈ ${new Intl.NumberFormat("en-US").format(
                            estimated.odometer!
                          )} mi, estimated from ${since.loads === 1 ? "1 load" : `${since.loads} loads`} since ${formatDate(truck.odometer_on!)}.`
                        : null
                    }
                    canManage={manager}
                    today={today}
                  />
                </div>
              )}
              {tab === "documents" && (
                <TruckDocuments
                  organizationId={organization.id}
                  truckId={truck.id}
                  documents={documents}
                  dueByKind={{
                    registration: truck.registration_expires_on,
                    annual_inspection:
                      items.find((item) => item.key === "annual_inspection")
                        ?.due ?? null,
                  }}
                  canManage={manager}
                  warn={warn}
                  today={today}
                />
              )}
            </PageTabPanel>
            {/* Beside the cards, what's due and the truck's setup stay in
              view; on a phone they come first. */}
            <aside className="order-first flex flex-col gap-4 lg:sticky lg:top-6 lg:order-none lg:max-h-[calc(100svh-3rem)] lg:overflow-y-auto">
              <TruckNextAction
                status={truck.status}
                outOfService={{
                  reason: truck.out_of_service_reason,
                  until: truck.out_of_service_until,
                }}
                items={items}
                pm={pm}
                today={today}
                manager={manager}
                truckHref={truckHref}
              />
              <TruckNotes
                organizationId={organization.id}
                truckId={truck.id}
                notes={truck.notes}
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
const TRUCK_TAB_SKELETONS = {
  overview: (
    <TabSkeleton>
      <FieldsCardSkeleton title="Truck details" fields={6} />
      <FieldsCardSkeleton title="Plate and compliance" />
      <FieldsCardSkeleton title="Ownership and driver" fields={2} />
    </TabSkeleton>
  ),
  maintenance: (
    <TabSkeleton>
      <FieldsCardSkeleton title="Maintenance schedule" fields={4} />
      <TableCardSkeleton title="Maintenance" rows={5} />
    </TabSkeleton>
  ),
  documents: (
    <TabSkeleton>
      <TableCardSkeleton title="Documents" />
    </TabSkeleton>
  ),
}
