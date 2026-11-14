import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { LoadAssignmentForm } from "@/components/loads/load-assignment-form"
import { LoadBrokerForm } from "@/components/loads/load-broker-form"
import { LoadChargesCard } from "@/components/loads/load-charges-card"
import { LoadDetailsCard } from "@/components/loads/load-details-card"
import { LoadExpensesCard } from "@/components/loads/load-expenses-card"
import { LoadHistoryCard } from "@/components/loads/load-history-card"
import { LoadSidePanel } from "@/components/loads/load-side-panel"
import { LoadStatusMenu } from "@/components/loads/load-status-menu"
import { LoadStopsCard } from "@/components/loads/load-stops-card"
import { buttonVariants } from "@/components/ui/button"
import { appUrl } from "@/lib/app-url"
import { getBrokerOptions } from "@/lib/brokers"
import { getLiveDispatch, getLoadEvents } from "@/lib/dispatch"
import { getDriverOptions } from "@/lib/drivers"
import { getFactoringCompany } from "@/lib/factoring"
import { getLoadDocuments } from "@/lib/load-documents"
import { getLoadExpenses } from "@/lib/load-expenses"
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

export default async function LoadPage({
  params,
}: PageProps<"/org/[slug]/loads/[id]">) {
  const { organization, detail } = await loadFor(params)
  if (!organization || !detail) {
    notFound()
  }
  const { load, stops, charges, versions } = detail

  const base = `/org/${organization.slug}/loads`
  const [
    drivers,
    trucks,
    brokers,
    factoring,
    dispatch,
    events,
    documents,
    expenses,
  ] = await Promise.all([
    getDriverOptions(organization.id),
    getTruckOptions(organization.id),
    getBrokerOptions(organization.id),
    getFactoringCompany(organization.id),
    getLiveDispatch(organization.id, load.id),
    getLoadEvents(organization.id, load.id),
    getLoadDocuments(organization.id, load.id),
    getLoadExpenses(organization.id, load.id),
  ])
  const link = dispatch ? `${await appUrl()}/dispatch/${dispatch.token}` : null

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
          All loads
        </Link>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <LoadDetailsCard
              organizationId={organization.id}
              load={load}
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
              statusMenu={
                <LoadStatusMenu organizationId={organization.id} load={load} />
              }
              notice={
                load.status === "cancelled" && load.cancel_reason ? (
                  <p className="mb-5 rounded-lg bg-muted px-4 py-3 text-sm">
                    <span className="font-medium">Cancelled:</span>{" "}
                    {load.cancel_reason}
                  </p>
                ) : null
              }
            />
            <LoadBrokerForm
              organizationId={organization.id}
              load={load}
              brokers={brokers}
              brokersHref={`/org/${organization.slug}/brokers`}
              factoringName={factoring?.name ?? null}
            />
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
            <LoadAssignmentForm
              // Remount when the assignment changes elsewhere (unassigning), so
              // the pickers don't keep the old truck and driver.
              key={`${load.truck_id ?? ""}:${load.driver_id ?? ""}`}
              organizationId={organization.id}
              load={load}
              drivers={drivers}
              driversBase={`/org/${organization.slug}/drivers`}
              trucks={trucks}
              trucksBase={`/org/${organization.slug}/equipment`}
              loadsBase={base}
              dispatch={dispatch}
              link={link}
            />
            <LoadExpensesCard
              organizationId={organization.id}
              loadId={load.id}
              expenses={expenses}
              hasLumperCharge={charges.some(
                (charge) => charge.kind === "lumper"
              )}
            />
          </div>
          {/* Beside the cards, what's next stays in view; on a phone it
              comes after them. */}
          <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:row-span-2 lg:max-h-[calc(100svh-3rem)] lg:overflow-y-auto">
            <LoadSidePanel
              organizationId={organization.id}
              load={load}
              charges={charges}
              documents={documents}
              expenses={expenses}
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
