import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { LoadAssignmentForm } from "@/components/loads/load-assignment-form"
import { LoadStatusMenu } from "@/components/loads/load-status-menu"
import { SettingsCard } from "@/components/settings/settings-card"
import { buttonVariants } from "@/components/ui/button"
import { formatRate, formatStopWindow } from "@/lib/load-format"
import { getDriverOptions } from "@/lib/drivers"
import { getLoad } from "@/lib/loads"
import { getOrganization } from "@/lib/organizations"

async function loadFor(params: PageProps<"/org/[slug]/loads/[id]">["params"]) {
  const { slug, id } = await params
  const organization = await getOrganization(slug)
  const load = organization ? await getLoad(organization.id, id) : null
  return { organization, load }
}

export async function generateMetadata({
  params,
}: PageProps<"/org/[slug]/loads/[id]">): Promise<Metadata> {
  const { load } = await loadFor(params)
  return { title: load ? `Load ${load.reference}` : "Load not found" }
}

function Detail({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium whitespace-pre-wrap">{children}</dd>
    </div>
  )
}

export default async function LoadPage({
  params,
}: PageProps<"/org/[slug]/loads/[id]">) {
  const { organization, load } = await loadFor(params)
  if (!organization || !load) {
    notFound()
  }

  const base = `/org/${organization.slug}/loads`
  const drivers = await getDriverOptions(organization.id)
  const none = <span className="text-muted-foreground">Not set</span>

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Link
          href={base}
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-ml-2 w-fit",
          })}
        >
          <ArrowLeft />
          All loads
        </Link>
        <SettingsCard
          title={`Load ${load.reference}`}
          description={load.broker_name}
          action={
            <LoadStatusMenu organizationId={organization.id} load={load} />
          }
        >
          <dl className="grid gap-5 sm:grid-cols-2">
            <Detail label="Pickup">
              {load.pickup_location}
              <span className="block font-normal text-muted-foreground">
                {formatStopWindow(load.pickup_start, load.pickup_end)}
              </span>
            </Detail>
            <Detail label="Delivery">
              {load.delivery_location}
              <span className="block font-normal text-muted-foreground">
                {formatStopWindow(load.delivery_start, load.delivery_end)}
              </span>
            </Detail>
          </dl>
        </SettingsCard>
        <SettingsCard title="Details">
          <dl className="grid gap-5 sm:grid-cols-3">
            <Detail label="Rate">{formatRate(load.rate)}</Detail>
            <Detail label="Rate per mile">
              {load.miles ? (
                `${formatRate(Number(load.rate) / load.miles)} / mile`
              ) : (
                <span className="text-muted-foreground">Add miles</span>
              )}
            </Detail>
            <Detail label="Truck">{load.truck ?? none}</Detail>
            <div className="sm:col-span-3">
              <Detail label="Notes">{load.notes ?? none}</Detail>
            </div>
          </dl>
        </SettingsCard>
        <LoadAssignmentForm
          organizationId={organization.id}
          load={load}
          drivers={drivers}
          driversBase={`/org/${organization.slug}/drivers`}
        />
      </div>
    </div>
  )
}
