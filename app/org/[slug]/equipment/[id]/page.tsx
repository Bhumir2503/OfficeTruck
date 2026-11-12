import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ExpiryDate } from "@/components/drivers/driver-badges"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
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

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
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
        <SettingsCard
          title={truck.unit_number}
          description={
            [description, truck.vin && `VIN ${truck.vin}`]
              .filter(Boolean)
              .join(" · ") || "No details yet"
          }
          action={<TruckStatusBadge status={truck.status} />}
          footer={
            manager && (
              <SettingsCardFooter
                hint={
                  truck.status === "active"
                    ? "Active trucks are billed. Out of service and inactive ones aren't."
                    : truck.status === "out_of_service"
                      ? "Out of service: not billed, and its dates aren't flagged."
                      : "Inactive: kept on record with its loads, but off the active list."
                }
              >
                <TruckStatusMenu
                  organizationId={organization.id}
                  truck={truck}
                />
              </SettingsCardFooter>
            )
          }
        >
          <dl className="grid gap-5 sm:grid-cols-3">
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
            <Detail label="Plate">
              {truck.plate_number
                ? `${truck.plate_number}${truck.plate_state ? ` · ${truck.plate_state}` : ""}`
                : none}
            </Detail>
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
              <Detail label="Notes" className="sm:col-span-3">
                {truck.notes}
              </Detail>
            )}
          </dl>
        </SettingsCard>
        <TruckWeek truck={truck} loads={loads} today={today} />
        <TruckLoads
          truck={truck}
          loads={loads}
          loadsBase={`/org/${organization.slug}/loads`}
        />
        {manager && (
          <div className="mt-2">
            <TruckForm
              organizationId={organization.id}
              base={base}
              drivers={drivers}
              truck={truck}
            />
          </div>
        )}
      </div>
    </div>
  )
}
