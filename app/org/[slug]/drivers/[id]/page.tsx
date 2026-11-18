import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DriverStatusBadge } from "@/components/drivers/driver-badges"
import { DriverDocuments } from "@/components/drivers/driver-documents"
import { DriverForm } from "@/components/drivers/driver-form"
import { DriverNotes } from "@/components/drivers/driver-notes"
import { DriverPayBox } from "@/components/drivers/driver-pay-box"
import {
  DRIVER_DOCUMENTS_ID,
  DriverSidePanel,
} from "@/components/drivers/driver-side-panel"
import { DriverStatusButton } from "@/components/drivers/driver-status-button"
import { buttonVariants } from "@/components/ui/button"
import {
  complianceItems,
  formatPay,
  today as getToday,
} from "@/lib/driver-format"
import { getDqDatesByDriver } from "@/lib/dq/fleet"
import { getDriver, getDriverLoads, getDriverDocuments } from "@/lib/drivers"
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
  const loadsBase = `/org/${organization.slug}/loads`
  const currentRate = formatPay(driver.pay_type, driver.pay_rate)
  // The Loads and Pay statement cards are set aside for now; loads still
  // feed the side panel's next step and the rate notice. The qualification
  // file is off the page too; its dates still feed the next step.
  const [loads, documents, dqDates] = await Promise.all([
    getDriverLoads(organization.id, driver.id),
    getDriverDocuments(organization.id, driver.id),
    getDqDatesByDriver(organization.id),
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
  const items = complianceItems(driver, dqDates[driver.id], today)
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
          {/* One column of cards, in the order they're reached for: who the
              driver is and their CDL. The edit
              form's cards are placed among the others with `order`, since the
              form can't wrap the cards that have forms of their own. */}
          <div className="flex min-w-0 flex-col gap-4">
            {manager && (
              <DriverForm
                organizationId={organization.id}
                base={base}
                driver={driver}
                cdlCopy={documents.find((doc) => doc.kind === "cdl") ?? null}
                medicalCopy={
                  documents.find((doc) => doc.kind === "medical_card") ?? null
                }
                cardClassName={{
                  details: "order-1",
                  cdl: "order-2",
                  medical: "order-3",
                  annual: "order-4",
                }}
              />
            )}
            <div className="order-5">
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
            </div>
          </div>
          {/* Beside the cards, what's next stays in view; on a phone it
              comes first. */}
          <aside className="order-first flex flex-col gap-4 lg:sticky lg:top-6 lg:order-none lg:max-h-[calc(100svh-3rem)] lg:overflow-y-auto">
            <DriverSidePanel
              organizationId={organization.id}
              driver={driver}
              items={items}
              loads={loads}
              manager={manager}
              loadsBase={loadsBase}
              documentKinds={documents.map((doc) => doc.kind)}
            />
            {manager && (
              <DriverPayBox
                organizationId={organization.id}
                driverId={driver.id}
                payType={driver.pay_type}
                payRate={driver.pay_rate}
                currentRate={currentRate}
                stale={staleLoads}
              />
            )}
            <DriverNotes
              organizationId={organization.id}
              driverId={driver.id}
              notes={driver.notes}
              canManage={manager}
            />
          </aside>
        </div>
      </div>
    </div>
  )
}
