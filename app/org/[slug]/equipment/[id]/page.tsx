import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { TruckStatusBadge } from "@/components/trucks/truck-badges"
import { TruckCostsBox } from "@/components/trucks/truck-costs-box"
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
import { buttonVariants } from "@/components/ui/button"
import { today as getToday } from "@/lib/driver-format"
import { getDriverOptions } from "@/lib/drivers"
import { canManage, getOrganization } from "@/lib/organizations"
import {
  pmStatus,
  truckComplianceItems,
  truckDescription,
} from "@/lib/truck-format"
import { getTruck, getTruckDocuments, getTruckMaintenance } from "@/lib/trucks"

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
}: PageProps<"/org/[slug]/equipment/[id]">) {
  const { organization, truck } = await truckFor(params)
  if (!organization || !truck) {
    notFound()
  }

  const base = `/org/${organization.slug}/equipment`
  const manager = canManage(organization)
  const today = getToday()
  const warn = truck.status === "active"
  // The This week and Loads cards are set aside for now.
  const [drivers, documents, maintenance] = await Promise.all([
    manager ? getDriverOptions(organization.id) : Promise.resolve([]),
    getTruckDocuments(organization.id, truck.id),
    getTruckMaintenance(organization.id, truck.id),
  ])
  const items = truckComplianceItems(truck, today)
  const lastPm = maintenance.find((entry) => entry.kind === "preventive")
  const pm = pmStatus(
    truck,
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
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          {/* The edit form's cards, then the truck's papers. */}
          <div className="flex min-w-0 flex-col gap-4">
            {manager ? (
              <TruckForm
                organizationId={organization.id}
                base={base}
                drivers={drivers}
                truck={truck}
              />
            ) : (
              <TruckSummary
                truck={truck}
                items={items}
                warn={warn}
                driversBase={`/org/${organization.slug}/drivers`}
              />
            )}
            <div id={TRUCK_MAINTENANCE_ID} className="scroll-mt-6">
              <TruckMaintenance
                organizationId={organization.id}
                truckId={truck.id}
                entries={maintenance}
                pm={pm}
                canManage={manager}
                today={today}
              />
            </div>
            <TruckDocuments
              organizationId={organization.id}
              truckId={truck.id}
              documents={documents}
              dueByKind={{
                registration: truck.registration_expires_on,
                annual_inspection:
                  items.find((item) => item.key === "annual_inspection")?.due ??
                  null,
              }}
              canManage={manager}
              warn={warn}
              today={today}
            />
          </div>
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
            />
            {manager && (
              <TruckCostsBox organizationId={organization.id} truck={truck} />
            )}
            <TruckNotes
              organizationId={organization.id}
              truckId={truck.id}
              notes={truck.notes}
              canManage={manager}
            />
          </aside>
        </div>
      </div>
    </div>
  )
}
