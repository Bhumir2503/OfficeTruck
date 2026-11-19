import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ExpiryDate } from "@/components/drivers/driver-badges"
import { EldBadge, TruckStatusBadge } from "@/components/trucks/truck-badges"
import { TruckForm } from "@/components/trucks/truck-form"
import { TruckLoads, TruckWeek } from "@/components/trucks/truck-history"
import { TruckStatusMenu } from "@/components/trucks/truck-status-menu"
import { buttonVariants } from "@/components/ui/button"
import { formatDate, today as getToday } from "@/lib/driver-format"
import { getDriverOptions } from "@/lib/drivers"
import { formatRate } from "@/lib/load-format"
import { canManage, getOrganization } from "@/lib/organizations"
import { OWNERSHIP_LABELS } from "@/lib/schemas/truck"
import {
  formatTaxYear,
  monthlyFixedCosts,
  taxItem,
  truckComplianceItems,
  truckDescription,
} from "@/lib/truck-format"
import { getTaxFilings, getTruck, getTruckLoads } from "@/lib/trucks"

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

function Detail({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium whitespace-pre-wrap">
        {children}
      </dd>
    </div>
  )
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
  const none = <span className="text-muted-foreground">Not set</span>
  const [loads, filings, drivers] = await Promise.all([
    getTruckLoads(organization.id, truck.id),
    getTaxFilings(organization.id),
    manager ? getDriverOptions(organization.id) : Promise.resolve([]),
  ])
  const items = truckComplianceItems(truck, today)
  const tax = taxItem(truck.id, filings, today)
  const description = truckDescription(truck)
  const monthly = monthlyFixedCosts(truck)

  const subtitle = [
    description,
    truck.vin && `VIN ${truck.vin}`,
    truck.plate_number &&
      `Plate ${truck.plate_number}${truck.plate_state ? ` · ${truck.plate_state}` : ""}`,
  ].filter(Boolean)
  const panel =
    "rounded-xl border bg-card px-5 pt-4 pb-5 text-card-foreground shadow-xs"

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
            <TruckStatusMenu organizationId={organization.id} truck={truck} />
          )}
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          {/* How the truck is doing, then its loads, then the edit form. */}
          <div className="flex min-w-0 flex-col gap-4">
            <TruckWeek truck={truck} loads={loads} today={today} />
            <TruckLoads
              truck={truck}
              loads={loads}
              loadsBase={`/org/${organization.slug}/loads`}
            />
            {manager && (
              <TruckForm
                organizationId={organization.id}
                base={base}
                drivers={drivers}
                truck={truck}
              />
            )}
          </div>
          {/* Beside the cards, what's due and the truck's setup stay in
              view; on a phone they come first. */}
          <aside className="order-first flex flex-col gap-4 lg:sticky lg:top-6 lg:order-none lg:max-h-[calc(100svh-3rem)] lg:overflow-y-auto">
            <section className={panel}>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Compliance
              </p>
              <dl className="mt-3 grid gap-4">
                {items.map((item) => (
                  <Detail
                    key={item.key}
                    label={
                      item.kind === "expires"
                        ? `${item.label} expires`
                        : `${item.label} due`
                    }
                  >
                    <ExpiryDate item={item} warn={warn} />
                    {item.kind === "due" && (
                      <span className="mt-0.5 block font-normal text-muted-foreground">
                        {item.last
                          ? `Last done ${formatDate(item.last)}`
                          : "Not done yet"}
                      </span>
                    )}
                  </Detail>
                ))}
                <Detail label="2290 heavy vehicle tax">
                  {tax.covered ? (
                    <>
                      Covered for {formatTaxYear(tax.taxYear)}
                      <span className="mt-0.5 block font-normal text-muted-foreground">
                        Next one due {formatDate(tax.due!)}
                      </span>
                    </>
                  ) : (
                    <>
                      <ExpiryDate item={tax} warn={warn} />
                      <span className="mt-0.5 block font-normal text-muted-foreground">
                        Not on the {formatTaxYear(tax.taxYear)} return.{" "}
                        <Link
                          href={`/org/${organization.slug}/compliance`}
                          className="underline"
                        >
                          Compliance
                        </Link>
                      </span>
                    </>
                  )}
                </Detail>
              </dl>
              {!warn && (
                <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                  {truck.status === "out_of_service"
                    ? "Out of service: not billed, and its dates aren't flagged."
                    : "Inactive: kept on record with its loads, but its dates aren't flagged."}
                </p>
              )}
            </section>
            <section className={panel}>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Setup
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-4">
                <Detail label="ELD">
                  <EldBadge connected={!!truck.motive_vehicle_id} />
                  {truck.motive_vehicle_id && (
                    <span className="mt-0.5 block font-normal text-muted-foreground">
                      Motive {truck.motive_vehicle_id}
                    </span>
                  )}
                </Detail>
                <Detail label="Ownership">
                  {truck.ownership ? OWNERSHIP_LABELS[truck.ownership] : none}
                </Detail>
                <Detail label="Default driver">
                  {truck.default_driver ? (
                    <Link
                      href={`/org/${organization.slug}/drivers/${truck.default_driver.id}`}
                      className="hover:underline"
                    >
                      {truck.default_driver.full_name}
                    </Link>
                  ) : (
                    none
                  )}
                </Detail>
                <Detail label="Fixed costs">
                  {monthly > 0 ? `${formatRate(monthly)} / month` : none}
                </Detail>
                {!manager && truck.notes && (
                  <Detail label="Notes" className="col-span-2">
                    {truck.notes}
                  </Detail>
                )}
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
