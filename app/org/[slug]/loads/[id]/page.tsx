import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { LoadAssignmentForm } from "@/components/loads/load-assignment-form"
import { LoadBrokerForm } from "@/components/loads/load-broker-form"
import { LoadChargesCard } from "@/components/loads/load-charges-card"
import { LoadDetailsCard } from "@/components/loads/load-details-card"
import { LoadStatusMenu } from "@/components/loads/load-status-menu"
import { LoadStopsCard } from "@/components/loads/load-stops-card"
import { SettingsCard } from "@/components/settings/settings-card"
import { buttonVariants } from "@/components/ui/button"
import { getBrokerOptions } from "@/lib/brokers"
import { getDriverOptions } from "@/lib/drivers"
import { getFactoringCompany } from "@/lib/factoring"
import { formatRate } from "@/lib/load-format"
import { getLoadDetail } from "@/lib/loads"
import { getOrganization } from "@/lib/organizations"
import { getTruckOptions } from "@/lib/trucks"

async function loadFor(params: PageProps<"/org/[slug]/loads/[id]">["params"]) {
  const { slug, id } = await params
  const organization = await getOrganization(slug)
  const detail = organization ? await getLoadDetail(organization.id, id) : null
  return { organization, detail }
}

export async function generateMetadata({
  params,
}: PageProps<"/org/[slug]/loads/[id]">): Promise<Metadata> {
  const { detail } = await loadFor(params)
  return { title: detail ? `Load ${detail.load.reference}` : "Load not found" }
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
  const { organization, detail } = await loadFor(params)
  if (!organization || !detail) {
    notFound()
  }
  const { load, stops, charges, versions } = detail

  const base = `/org/${organization.slug}/loads`
  const [drivers, trucks, brokers, factoring] = await Promise.all([
    getDriverOptions(organization.id),
    getTruckOptions(organization.id),
    getBrokerOptions(organization.id),
    getFactoringCompany(organization.id),
  ])
  const none = <span className="text-muted-foreground">Not set</span>

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
          All loads
        </Link>
        <SettingsCard
          title={`Load ${load.reference}`}
          description={
            load.broker ? (
              <Link
                href={`/org/${organization.slug}/brokers/${load.broker.id}`}
                className="hover:underline"
              >
                {load.broker_name}
              </Link>
            ) : (
              load.broker_name
            )
          }
          action={
            <LoadStatusMenu organizationId={organization.id} load={load} />
          }
        >
          <dl className="grid gap-5 sm:grid-cols-3">
            <Detail label="Total">{formatRate(load.rate)}</Detail>
            <Detail label="Rate per loaded mile">
              {load.miles ? (
                `${formatRate(Number(load.rate) / load.miles)} / mile`
              ) : (
                <span className="text-muted-foreground">Add miles</span>
              )}
            </Detail>
            <Detail label="Miles">
              {load.miles !== null
                ? `${load.miles.toLocaleString("en-US")} loaded · ${(load.empty_miles ?? 0).toLocaleString("en-US")} empty`
                : none}
            </Detail>
          </dl>
        </SettingsCard>
        <LoadStopsCard
          organizationId={organization.id}
          load={load}
          stops={stops}
          billedNotes={charges
            .filter(
              (charge) =>
                charge.kind === "detention" && charge.description !== null
            )
            .map((charge) => charge.description as string)}
        />
        <LoadChargesCard
          organizationId={organization.id}
          load={load}
          charges={charges}
          versions={versions}
        />
        <LoadDetailsCard organizationId={organization.id} load={load} />
        <LoadBrokerForm
          organizationId={organization.id}
          load={load}
          brokers={brokers}
          brokersHref={`/org/${organization.slug}/brokers`}
          factoringName={factoring?.name ?? null}
        />
        <LoadAssignmentForm
          organizationId={organization.id}
          load={load}
          drivers={drivers}
          driversBase={`/org/${organization.slug}/drivers`}
          trucks={trucks}
          trucksBase={`/org/${organization.slug}/equipment`}
        />
      </div>
    </div>
  )
}
