import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { LoadBrokerForm } from "@/components/loads/load-broker-form"
import { LoadChargesCard } from "@/components/loads/load-charges-card"
import { LoadDetailsCard } from "@/components/loads/load-details-card"
import { LoadDispatchCard } from "@/components/loads/load-dispatch-card"
import { LoadHistoryCard } from "@/components/loads/load-history-card"
import { LoadSidePanel } from "@/components/loads/load-side-panel"
import { LoadStatusMenu } from "@/components/loads/load-status-menu"
import { LoadStopsCard } from "@/components/loads/load-stops-card"
import { SettingsCard } from "@/components/settings/settings-card"
import { buttonVariants } from "@/components/ui/button"
import { appUrl } from "@/lib/app-url"
import { getBrokerOptions } from "@/lib/brokers"
import {
  findDriverOverlaps,
  getLiveDispatch,
  getLoadEvents,
} from "@/lib/dispatch"
import { getDriverOptions } from "@/lib/drivers"
import { getFactoringCompany } from "@/lib/factoring"
import { getLoadDocuments } from "@/lib/load-documents"
import { formatRate } from "@/lib/load-format"
import { getLoadDetail } from "@/lib/loads"
import { getOrganization } from "@/lib/organizations"
import { createClient } from "@/lib/supabase/server"
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
  const supabase = await createClient()
  const [
    drivers,
    trucks,
    brokers,
    factoring,
    dispatch,
    events,
    documents,
    overlaps,
    { data: org },
    { data: driverRow },
  ] = await Promise.all([
    getDriverOptions(organization.id),
    getTruckOptions(organization.id),
    getBrokerOptions(organization.id),
    getFactoringCompany(organization.id),
    getLiveDispatch(organization.id, load.id),
    getLoadEvents(organization.id, load.id),
    getLoadDocuments(organization.id, load.id),
    load.driver_id
      ? findDriverOverlaps(organization.id, load.driver_id, load.id)
      : Promise.resolve([]),
    supabase
      .from("organizations")
      .select("share_rate_with_drivers")
      .eq("id", organization.id)
      .single(),
    load.driver_id
      ? supabase
          .from("drivers")
          .select("email")
          .eq("id", load.driver_id)
          .single()
      : Promise.resolve({ data: null }),
  ])
  const link = dispatch ? `${await appUrl()}/dispatch/${dispatch.token}` : null

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
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
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-4">
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
              {load.status === "cancelled" && load.cancel_reason && (
                <p className="mb-5 rounded-lg bg-muted px-4 py-3 text-sm">
                  <span className="font-medium">Canceled:</span>{" "}
                  {load.cancel_reason}
                </p>
              )}
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
                  {load.miles !== null ? (
                    `${load.miles.toLocaleString("en-US")} loaded · ${(load.empty_miles ?? 0).toLocaleString("en-US")} empty`
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
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
            <LoadDispatchCard
              // Remount when the assignment changes elsewhere (unassigning), so
              // the pickers don't keep the old truck and driver.
              key={`${load.truck_id ?? ""}:${load.driver_id ?? ""}`}
              organizationId={organization.id}
              load={load}
              drivers={drivers}
              driversBase={`/org/${organization.slug}/drivers`}
              trucks={trucks}
              trucksBase={`/org/${organization.slug}/equipment`}
              dispatch={dispatch}
              link={link}
              shareRate={org?.share_rate_with_drivers ?? false}
              overlaps={overlaps.map(({ id, reference }) => ({
                id,
                reference,
              }))}
              driverEmail={driverRow?.email ?? null}
              loadsBase={base}
              settingsHref={`/org/${organization.slug}/settings`}
            />
          </div>
          {/* Beside the cards, what's next stays in view; on a phone it
              comes after them. */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:row-span-2 lg:max-h-[calc(100svh-3rem)] lg:overflow-y-auto">
            <LoadSidePanel
              organizationId={organization.id}
              load={load}
              charges={charges}
              documents={documents}
              dispatch={dispatch}
            />
          </aside>
          {/* Under the cards on a wide screen; last of all on a phone. */}
          <div className="min-w-0">
            <LoadHistoryCard events={events} />
          </div>
        </div>
      </div>
    </div>
  )
}
