import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ExpiryDate } from "@/components/drivers/driver-badges"
import { TrailerDocuments } from "@/components/trailers/trailer-documents"
import { TrailerForm } from "@/components/trailers/trailer-form"
import { TrailerStatusMenu } from "@/components/trailers/trailer-status-menu"
import { TruckStatusBadge } from "@/components/trucks/truck-badges"
import { TruckMaintenance } from "@/components/trucks/truck-maintenance"
import { buttonVariants } from "@/components/ui/button"
import { formatDate, today as getToday } from "@/lib/driver-format"
import { canManage, getOrganization } from "@/lib/organizations"
import { OWNERSHIP_LABELS } from "@/lib/schemas/truck"
import { trailerDescription } from "@/lib/trailer-format"
import {
  getTrailer,
  getTrailerDocuments,
  getTrailerMaintenance,
} from "@/lib/trailers"
import { truckComplianceItems } from "@/lib/truck-format"
import { getTruckOptions } from "@/lib/trucks"

async function trailerFor(
  params: PageProps<"/org/[slug]/trailers/[id]">["params"]
) {
  const { slug, id } = await params
  const organization = await getOrganization(slug)
  const trailer = organization ? await getTrailer(organization.id, id) : null
  return { organization, trailer }
}

export async function generateMetadata({
  params,
}: PageProps<"/org/[slug]/trailers/[id]">): Promise<Metadata> {
  const { trailer } = await trailerFor(params)
  return { title: trailer ? trailer.unit_number : "Trailer not found" }
}

function Detail({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium whitespace-pre-wrap">
        {children}
      </dd>
    </div>
  )
}

export default async function TrailerPage({
  params,
}: PageProps<"/org/[slug]/trailers/[id]">) {
  const { organization, trailer } = await trailerFor(params)
  if (!organization || !trailer) {
    notFound()
  }

  const base = `/org/${organization.slug}/trailers`
  const manager = canManage(organization)
  const today = getToday()
  const warn = trailer.status === "active"
  const none = <span className="text-muted-foreground">Not set</span>
  const [trucks, maintenance, documents] = await Promise.all([
    manager ? getTruckOptions(organization.id) : Promise.resolve([]),
    getTrailerMaintenance(organization.id, trailer.id),
    getTrailerDocuments(organization.id, trailer.id),
  ])
  // Same three dates as a truck: inspection, registration, plate.
  const items = truckComplianceItems(trailer, today)
  const subtitle = [
    trailerDescription(trailer),
    trailer.vin && `VIN ${trailer.vin}`,
    trailer.plate_number &&
      `Plate ${trailer.plate_number}${trailer.plate_state ? ` · ${trailer.plate_state}` : ""}`,
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
          All trailers
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-tight">
                {trailer.unit_number}
              </h2>
              <TruckStatusBadge
                status={trailer.status}
                className={
                  trailer.status === "active" ? "bg-emerald-500/15" : undefined
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
            <TrailerStatusMenu
              organizationId={organization.id}
              trailer={trailer}
              listHref={base}
            />
          )}
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-4">
            {manager ? (
              <TrailerForm
                organizationId={organization.id}
                base={base}
                trucks={trucks}
                trailer={trailer}
              />
            ) : (
              <section className={panel}>
                <dl className="grid gap-5 sm:grid-cols-3">
                  <Detail label="Ownership">
                    {trailer.ownership
                      ? OWNERSHIP_LABELS[trailer.ownership]
                      : none}
                  </Detail>
                  <Detail label="Plate">
                    {trailer.plate_number
                      ? `${trailer.plate_number}${trailer.plate_state ? ` · ${trailer.plate_state}` : ""}`
                      : none}
                  </Detail>
                  {trailer.notes && (
                    <Detail label="Notes">{trailer.notes}</Detail>
                  )}
                </dl>
              </section>
            )}
            <TruckMaintenance
              organizationId={organization.id}
              vehicle="trailer"
              truckId={trailer.id}
              entries={maintenance}
              printHref={`/print/${organization.slug}/trailers/${trailer.id}/maintenance`}
              canManage={manager}
              today={today}
            />
            <TrailerDocuments
              organizationId={organization.id}
              trailerId={trailer.id}
              documents={documents}
              dueByKind={{
                registration: trailer.registration_expires_on,
                annual_inspection:
                  items.find((item) => item.key === "annual_inspection")?.due ??
                  null,
              }}
              canManage={manager}
              warn={warn}
              today={today}
            />
          </div>
          {/* What's due and who's pulling it stay in view; on a phone
              they come first. */}
          <aside className="order-first flex flex-col gap-4 lg:sticky lg:top-6 lg:order-none">
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
                    {item.kind === "due" && item.last && (
                      <span className="mt-0.5 block font-normal text-muted-foreground">
                        Last done {formatDate(item.last)}
                      </span>
                    )}
                  </Detail>
                ))}
              </dl>
              {!warn && (
                <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                  Its dates aren&apos;t flagged while it isn&apos;t active.
                </p>
              )}
            </section>
            <section className={panel}>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Pulled by
              </p>
              <p className="mt-2 text-sm font-medium">
                {trailer.truck ? (
                  <Link
                    href={`/org/${organization.slug}/equipment/${trailer.truck.id}`}
                    className="hover:underline"
                  >
                    {trailer.truck.unit_number}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Unhooked</span>
                )}
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
