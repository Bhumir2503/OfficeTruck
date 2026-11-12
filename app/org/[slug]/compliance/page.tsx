import type { Metadata } from "next"
import { ShieldCheck } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { TaxFilingForm } from "@/components/compliance/tax-filing-form"
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
  expiry,
  formatDate,
  needsAction,
  today as getToday,
  type ComplianceItem,
} from "@/lib/driver-format"
import { getDrivers } from "@/lib/drivers"
import { canManage, getOrganization } from "@/lib/organizations"
import {
  formatTaxYear,
  taxYearDueDate,
  taxYearOf,
  truckComplianceItems,
} from "@/lib/truck-format"
import { getTaxFilings, getTrucks } from "@/lib/trucks"

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
  const [drivers, trucks, filings] = await Promise.all([
    getDrivers(organization.id),
    getTrucks(organization.id),
    getTaxFilings(organization.id),
  ])

  const currentTaxYear = taxYearOf(today)
  const currentFiling = filings.find((f) => f.tax_year === currentTaxYear)
  const activeTrucks = trucks.filter((truck) => truck.status === "active")
  const uncovered = activeTrucks.filter(
    (truck) => !currentFiling?.truck_ids.includes(truck.id)
  )

  // Everything late or due in the next 60 days, for active drivers and trucks.
  const upcoming: Upcoming[] = [
    ...drivers
      .filter((driver) => driver.status === "active")
      .flatMap((driver) =>
        complianceItems(driver, today).map((item) => ({
          item,
          owner: driver.full_name,
          href: `/org/${slug}/drivers/${driver.id}`,
        }))
      ),
    ...activeTrucks.flatMap((truck) =>
      truckComplianceItems(truck, today).map((item) => ({
        item,
        owner: truck.unit_number,
        href: `/org/${slug}/equipment/${truck.id}`,
      }))
    ),
  ]
  // The company's 2290: due this tax year until it's filed, then next year.
  if (activeTrucks.length > 0) {
    const due = taxYearDueDate(
      currentFiling ? currentTaxYear + 1 : currentTaxYear
    )
    upcoming.push({
      item: {
        key: "form_2290",
        label: `2290 for ${formatTaxYear(currentFiling ? currentTaxYear + 1 : currentTaxYear)}`,
        kind: "due",
        due,
        expiry: expiry(due, today),
      },
      owner: "Company",
      href: null,
    })
  }
  const due = upcoming
    .filter(({ item }) => needsAction(item.expiry.state))
    .sort((a, b) => urgency(a) - urgency(b))

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <SettingsCard
          title="Due soon"
          description="Anything late or due in the next 60 days, for active drivers and trucks."
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
                      {item.due && formatDate(item.due)}
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

        <SettingsCard
          title="2290 heavy vehicle tax"
          description={`Tax year ${formatTaxYear(currentTaxYear)} runs July 1 to June 30. The return is due by ${formatDate(taxYearDueDate(currentTaxYear))}.`}
          contentClassName={filings.length ? "px-0 pb-0" : undefined}
          footer={
            <SettingsCardFooter
              hint={
                activeTrucks.length === 0 ? (
                  "No active trucks yet."
                ) : uncovered.length === 0 ? (
                  `All ${activeTrucks.length} active ${activeTrucks.length === 1 ? "truck is" : "trucks are"} on the ${formatTaxYear(currentTaxYear)} return.`
                ) : (
                  <span className="text-amber-700 dark:text-amber-300">
                    Not on the {formatTaxYear(currentTaxYear)} return:{" "}
                    {uncovered.map((truck) => truck.unit_number).join(", ")}
                  </span>
                )
              }
            />
          }
        >
          {filings.length === 0 ? (
            <SettingsEmptyState icon={ShieldCheck} title="No 2290 on file">
              {canManage(organization)
                ? "Record the return below once it's filed, and tick the trucks it covers."
                : "Owners and admins record the 2290 here once it's filed."}
            </SettingsEmptyState>
          ) : (
            <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Tax year</TableHead>
                  <TableHead>Filed</TableHead>
                  <TableHead>Trucks</TableHead>
                  <TableHead className="hidden md:table-cell">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filings.map((filing) => {
                  const names = trucks
                    .filter((truck) => filing.truck_ids.includes(truck.id))
                    .map((truck) => truck.unit_number)
                  return (
                    <TableRow key={filing.id}>
                      <TableCell className="py-3 font-medium">
                        {formatTaxYear(filing.tax_year)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(filing.filed_on)}
                      </TableCell>
                      <TableCell className="max-w-72 text-sm whitespace-normal">
                        {names.length ? (
                          names.join(", ")
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden max-w-64 truncate text-sm text-muted-foreground md:table-cell">
                        {filing.notes ?? "—"}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </SettingsCard>

        {canManage(organization) && (
          <TaxFilingForm
            organizationId={organization.id}
            currentTaxYear={currentTaxYear}
            filings={filings}
            trucks={trucks}
          />
        )}
      </div>
    </div>
  )
}
