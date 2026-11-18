import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import {
  DqFileSection,
  DqFileSummary,
  DRIVER_FILE_ID,
  loadDqFile,
} from "@/components/dq/dq-file-section"
import { DriverStatusBadge } from "@/components/drivers/driver-badges"
import { DriverDocuments } from "@/components/drivers/driver-documents"
import { DriverForm } from "@/components/drivers/driver-form"
import {
  DRIVER_DOCUMENTS_ID,
  DriverSidePanel,
} from "@/components/drivers/driver-side-panel"
import { DriverStatusButton } from "@/components/drivers/driver-status-button"
import { buttonVariants } from "@/components/ui/button"
import {
  complianceItems,
  dqComplianceDates,
  today as getToday,
} from "@/lib/driver-format"
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
  // The Pay and Loads cards are set aside for now; their components are
  // kept. Loads still feed the side panel's next step.
  const [loads, documents, dqFile] = await Promise.all([
    getDriverLoads(organization.id, driver.id),
    getDriverDocuments(organization.id, driver.id),
    loadDqFile({
      driverId: driver.id,
      organizationId: organization.id,
      manager,
      today,
    }),
  ])
  const items = complianceItems(driver, dqComplianceDates(dqFile.items), today)
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
              driver is, their compliance dates and qualification file, their
              documents, then their work, with notes last. The edit
              form's cards are placed among the others with `order`, since the
              form can't wrap the cards that have forms of their own. */}
          <div className="flex min-w-0 flex-col gap-4">
            {manager && (
              <DriverForm
                organizationId={organization.id}
                base={base}
                driver={driver}
                cdlCopy={documents.find((doc) => doc.kind === "cdl") ?? null}
                cardClassName={{
                  details: "order-1",
                  cdl: "order-2",
                  notes: "order-7",
                }}
              />
            )}
            <div id={DRIVER_FILE_ID} className="order-3 scroll-mt-6">
              <DqFileSection file={dqFile} />
            </div>
            <div className="order-4">
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
            <DqFileSummary file={dqFile} />
            <DriverSidePanel
              organizationId={organization.id}
              driver={driver}
              items={items}
              documents={documents}
              loads={loads}
              manager={manager}
              loadsBase={loadsBase}
            />
          </aside>
        </div>
      </div>
    </div>
  )
}
