import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import {
  DriverStatusBadge,
  ExpiryDate,
} from "@/components/drivers/driver-badges"
import { DriverForm } from "@/components/drivers/driver-form"
import { DriverLoads } from "@/components/drivers/driver-loads"
import { DriverPhotos } from "@/components/drivers/driver-photos"
import { DriverStatusButton } from "@/components/drivers/driver-status-button"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { buttonVariants } from "@/components/ui/button"
import {
  complianceItems,
  formatDate,
  formatPay,
  today as getToday,
} from "@/lib/driver-format"
import { getDriver, getDriverLoads, getDriverPhotoUrls } from "@/lib/drivers"
import { canManage, getOrganization } from "@/lib/organizations"
import { formatPhone } from "@/lib/phone"

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

export default async function DriverPage({
  params,
}: PageProps<"/org/[slug]/drivers/[id]">) {
  const { organization, driver } = await driverFor(params)
  if (!organization || !driver) {
    notFound()
  }

  const base = `/org/${organization.slug}/drivers`
  const manager = canManage(organization)
  const today = getToday()
  const warn = driver.status === "active"
  const none = <span className="text-muted-foreground">Not set</span>
  const items = complianceItems(driver, today)
  const [loads, photoUrls] = await Promise.all([
    getDriverLoads(organization.id, driver.id),
    getDriverPhotoUrls(driver),
  ])

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
          All drivers
        </Link>
        <SettingsCard
          title={driver.full_name}
          description={
            driver.cdl_number
              ? `CDL ${driver.cdl_number}${driver.cdl_state ? ` · ${driver.cdl_state}` : ""}`
              : "No CDL on file"
          }
          action={<DriverStatusBadge status={driver.status} />}
          footer={
            manager && (
              <SettingsCardFooter
                hint={
                  driver.status === "active"
                    ? "Inactive drivers stay on record but drop off the active list."
                    : "This driver is inactive. Mark them active to put them back on the list."
                }
              >
                <DriverStatusButton
                  organizationId={organization.id}
                  driver={driver}
                />
              </SettingsCardFooter>
            )
          }
        >
          <dl className="grid gap-5 sm:grid-cols-2">
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
            <Detail label="Pay">
              {formatPay(driver.pay_type, driver.pay_rate) ?? none}
            </Detail>
            {!manager && (
              <>
                <Detail label="Phone">
                  {driver.phone ? (
                    <a href={`tel:${driver.phone}`} className="hover:underline">
                      {formatPhone(driver.phone)}
                    </a>
                  ) : (
                    none
                  )}
                </Detail>
                <Detail label="Email">
                  {driver.email ? (
                    <a
                      href={`mailto:${driver.email}`}
                      className="hover:underline"
                    >
                      {driver.email}
                    </a>
                  ) : (
                    none
                  )}
                </Detail>
                <Detail label="Notes" className="sm:col-span-2">
                  {driver.notes ?? none}
                </Detail>
              </>
            )}
          </dl>
        </SettingsCard>
        <SettingsCard
          title="CDL and medical card"
          description={
            manager
              ? "Photos or PDFs, kept private to your organization."
              : "Kept private to your organization."
          }
        >
          <DriverPhotos
            organizationId={organization.id}
            driverId={driver.id}
            urls={photoUrls}
            paths={{
              cdl: driver.cdl_photo_path,
              medical_card: driver.medical_card_photo_path,
            }}
            canManage={manager}
          />
        </SettingsCard>
        <DriverLoads
          loads={loads}
          driver={driver}
          loadsBase={`/org/${organization.slug}/loads`}
        />
        {manager && (
          <div className="mt-2">
            <DriverForm
              organizationId={organization.id}
              base={base}
              driver={driver}
            />
          </div>
        )}
      </div>
    </div>
  )
}
