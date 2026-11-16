import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DriverStatusBadge } from "@/components/drivers/driver-badges"
import { DriverForm } from "@/components/drivers/driver-form"
import { DriverLoads } from "@/components/drivers/driver-loads"
import { DriverPay } from "@/components/drivers/driver-pay"
import { DriverPhotos } from "@/components/drivers/driver-photos"
import { DriverRateNotice } from "@/components/drivers/driver-rate-notice"
import {
  DRIVER_DOCUMENTS_ID,
  DriverSidePanel,
} from "@/components/drivers/driver-side-panel"
import { DriverStatusButton } from "@/components/drivers/driver-status-button"
import { SettingsCard } from "@/components/settings/settings-card"
import { buttonVariants } from "@/components/ui/button"
import {
  complianceItems,
  formatPay,
  today as getToday,
} from "@/lib/driver-format"
import { getDriver, getDriverLoads, getDriverPhotoUrls } from "@/lib/drivers"
import { canManage, getOrganization } from "@/lib/organizations"
import { formatPhone } from "@/lib/phone"
import { parseWeek, shiftWeek, weekOf } from "@/lib/settlement-format"
import { getSettlement } from "@/lib/settlements"

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
  const manager = canManage(organization)
  const today = getToday()
  const loadsBase = `/org/${organization.slug}/loads`
  const items = complianceItems(driver, today)
  const currentRate = formatPay(driver.pay_type, driver.pay_rate)
  // Pay shows last week by default: the week payroll usually covers.
  const thisWeek = weekOf(today)
  const week = parseWeek((await searchParams).week) ?? shiftWeek(thisWeek, -1)
  const [loads, photoUrls, settlement] = await Promise.all([
    getDriverLoads(organization.id, driver.id),
    getDriverPhotoUrls(driver),
    manager ? getSettlement(organization.id, driver.id, week) : null,
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
          {manager && driver.status === "active" && (
            <DriverStatusButton
              organizationId={organization.id}
              driver={{
                id: driver.id,
                full_name: driver.full_name,
                status: driver.status,
              }}
            />
          )}
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-6">
            {manager && staleLoads.length > 0 && currentRate && (
              <DriverRateNotice
                organizationId={organization.id}
                driverId={driver.id}
                driverName={driver.full_name}
                currentRate={currentRate}
                stale={staleLoads}
              />
            )}
            <DriverLoads loads={loads} loadsBase={loadsBase} />
            {settlement && (
              <DriverPay
                organizationId={organization.id}
                settlement={settlement}
                today={today}
                loadsBase={loadsBase}
                prevHref={`${base}/${driver.id}?week=${shiftWeek(week, -1)}#pay`}
                nextHref={
                  week < thisWeek
                    ? `${base}/${driver.id}?week=${shiftWeek(week, 1)}#pay`
                    : null
                }
              />
            )}
            <SettingsCard
              id={DRIVER_DOCUMENTS_ID}
              className="scroll-mt-6"
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
          </div>
          {/* Beside the cards, what's next stays in view; on a phone it
              comes after them. */}
          <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:row-span-2 lg:max-h-[calc(100svh-3rem)] lg:overflow-y-auto">
            <DriverSidePanel
              organizationId={organization.id}
              driver={driver}
              items={items}
              loads={loads}
              manager={manager}
              loadsBase={loadsBase}
              today={today}
            />
          </aside>
          {manager && (
            <div className="min-w-0">
              <DriverForm
                organizationId={organization.id}
                base={base}
                driver={driver}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
