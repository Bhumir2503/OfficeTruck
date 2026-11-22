import type { Metadata } from "next"
import { ShieldCheck } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ExpiryBadge } from "@/components/drivers/driver-badges"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  complianceItems,
  formatDate,
  needsAction,
  today as getToday,
  type ComplianceItem,
} from "@/lib/driver-format"
import { getDqDatesByDriver } from "@/lib/dq/fleet"
import { getDrivers } from "@/lib/drivers"
import { getOrganization } from "@/lib/organizations"
import {
  truckComplianceItems,
  truckServiceItem,
  withEstimatedOdometer,
} from "@/lib/truck-format"
import { getTrailers } from "@/lib/trailers"
import {
  getLastServiceByTruck,
  getMilesSinceReading,
  getTrucks,
} from "@/lib/trucks"

export const metadata: Metadata = { title: "Compliance" }

type Upcoming = {
  item: ComplianceItem
  /** Who or what it's for, e.g. a driver's name or a unit number. */
  owner: string
  href: string | null
}

/** Sorts the most pressing first: furthest overdue, then soonest due. */
function urgency({ item }: Upcoming) {
  const { expiry } = item
  if (expiry.state === "missing") return Infinity
  return expiry.state === "expired" ? -expiry.days : expiry.days
}

export default async function CompliancePage({
  params,
}: PageProps<"/org/[slug]/compliance">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const slug = organization.slug
  const today = getToday()
  const [drivers, trucks, trailers, dqDates, lastService] = await Promise.all([
    getDrivers(organization.id),
    getTrucks(organization.id),
    getTrailers(organization.id),
    getDqDatesByDriver(organization.id),
    getLastServiceByTruck(organization.id),
  ])

  const activeTrucks = trucks.filter((truck) => truck.status === "active")
  // Service by mileage counts from the odometer estimated from loads run
  // since the last reading.
  const milesSince = await getMilesSinceReading(organization.id, activeTrucks)

  // Everything late or due in the next 60 days, for active drivers, trucks
  // and trailers.
  const upcoming: Upcoming[] = [
    ...drivers
      .filter((driver) => driver.status === "active")
      .flatMap((driver) =>
        complianceItems(driver, dqDates[driver.id], today).map((item) => ({
          item,
          owner: driver.full_name,
          href: `/org/${slug}/drivers/${driver.id}`,
        }))
      ),
    ...activeTrucks.flatMap((truck) =>
      [
        ...truckComplianceItems(truck, today),
        truckServiceItem(
          withEstimatedOdometer(truck, milesSince[truck.id]),
          lastService[truck.id],
          today
        ),
      ]
        .filter((item) => item !== null)
        .map((item) => ({
          item,
          owner: truck.unit_number,
          href: `/org/${slug}/equipment/${truck.id}`,
        }))
    ),
    // Trailers have the same three dates as trucks.
    ...trailers
      .filter((trailer) => trailer.status === "active")
      .flatMap((trailer) =>
        truckComplianceItems(trailer, today).map((item) => ({
          item,
          owner: trailer.unit_number,
          href: `/org/${slug}/trailers/${trailer.id}`,
        }))
      ),
  ]
  const due = upcoming
    .filter(({ item }) => needsAction(item.expiry.state))
    .sort((a, b) => urgency(a) - urgency(b))

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <SettingsCard
          title="Due soon"
          description="Anything late or due in the next 60 days, for active drivers, trucks and trailers."
          contentClassName={due.length ? "px-0 pb-0" : undefined}
          footer={
            due.length > 0 && (
              <SettingsCardFooter
                hint={`${due.length} ${due.length === 1 ? "item" : "items"}. Reminders by text are coming later.`}
              />
            )
          }
        >
          {due.length === 0 ? (
            <SettingsEmptyState icon={ShieldCheck} title="Nothing due">
              Nothing is late or due in the next 60 days. Dates you add to
              drivers and trucks show up here when they get close.
            </SettingsEmptyState>
          ) : (
            <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>For</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {due.map(({ item, owner, href }) => (
                  <TableRow key={`${href ?? owner}-${item.key}`}>
                    <TableCell className="py-3 font-medium">
                      {item.label}
                    </TableCell>
                    <TableCell>
                      {href ? (
                        <Link href={href} className="hover:underline">
                          {owner}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{owner}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {item.due ? formatDate(item.due) : item.whenText}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <ExpiryBadge item={item} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SettingsCard>
      </div>
    </div>
  )
}
