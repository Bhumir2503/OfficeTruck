import type { Metadata } from "next"
import { ArrowLeft, Ban, Package, Wallet } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DoNotUseBadge, FlagBadge } from "@/components/brokers/broker-badges"
import {
  ContactsCard,
  DoNotUseControl,
  RecheckButton,
} from "@/components/brokers/broker-actions"
import { BrokerForm } from "@/components/brokers/broker-form"
import { SenderWarning } from "@/components/brokers/sender-warning"
import { LoadStatusBadge } from "@/components/loads/load-status-menu"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  checkSender,
  fmcsaFlags,
  formatMc,
  formatTerms,
} from "@/lib/broker-format"
import { getBroker, getBrokerContacts, getBrokerLoads } from "@/lib/brokers"
import { formatDate } from "@/lib/driver-format"
import { getFactoringCompany } from "@/lib/factoring"
import { formatRate, formatStopDate } from "@/lib/load-format"
import { getOrganization } from "@/lib/organizations"
import { formatPhone } from "@/lib/phone"

async function brokerFor(
  params: PageProps<"/org/[slug]/brokers/[id]">["params"]
) {
  const { slug, id } = await params
  const organization = await getOrganization(slug)
  const broker = organization ? await getBroker(organization.id, id) : null
  return { organization, broker }
}

export async function generateMetadata({
  params,
}: PageProps<"/org/[slug]/brokers/[id]">): Promise<Metadata> {
  const { broker } = await brokerFor(params)
  return { title: broker ? broker.legal_name : "Broker not found" }
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
      <dd className="mt-1 text-sm font-medium break-words whitespace-pre-wrap">
        {children}
      </dd>
    </div>
  )
}

const checkedFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
})

/** true → yes, false → no (in red), null → FMCSA didn't say. */
function YesNo({ value, no = "No" }: { value: boolean | null; no?: string }) {
  if (value === null) {
    return <span className="text-muted-foreground">Not reported</span>
  }
  return value ? <>Yes</> : <span className="text-destructive">{no}</span>
}

export default async function BrokerPage({
  params,
}: PageProps<"/org/[slug]/brokers/[id]">) {
  const { organization, broker } = await brokerFor(params)
  if (!organization || !broker) {
    notFound()
  }

  const base = `/org/${organization.slug}/brokers`
  const none = <span className="text-muted-foreground">Not set</span>
  const factoringHref = `/org/${organization.slug}/settings/factoring`
  const [contacts, loads, factoring] = await Promise.all([
    getBrokerContacts(organization.id, broker.id),
    getBrokerLoads(organization.id, broker.id),
    getFactoringCompany(organization.id),
  ])
  const fmcsa = broker.fmcsa
  const flags = fmcsaFlags(fmcsa)
  const address = [
    broker.address_line1,
    broker.address_line2,
    [broker.city, [broker.state, broker.postal_code].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join("\n")
  const fmcsaAddress = fmcsa
    ? [
        fmcsa.street,
        [fmcsa.city, [fmcsa.state, fmcsa.postal_code].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", "),
      ]
        .filter(Boolean)
        .join("\n")
    : ""

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
          All brokers
        </Link>

        <SettingsCard
          title={broker.legal_name}
          description={
            [
              broker.dba_name && `DBA ${broker.dba_name}`,
              formatMc(broker.mc_number),
              broker.dot_number && `USDOT ${broker.dot_number}`,
            ]
              .filter(Boolean)
              .join(" · ") || "No MC or USDOT number"
          }
          action={broker.do_not_use ? <DoNotUseBadge /> : undefined}
          footer={
            <SettingsCardFooter
              hint={
                broker.do_not_use
                  ? "New loads with this broker show a do-not-use warning."
                  : "Stop booking with a broker without losing their history."
              }
            >
              <DoNotUseControl
                organizationId={organization.id}
                broker={broker}
              />
            </SettingsCardFooter>
          }
        >
          {broker.do_not_use && (
            <div className="mb-5 flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <Ban className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-medium">Do not use.</span>{" "}
                {broker.do_not_use_reason ?? "No reason given."}
              </span>
            </div>
          )}
          <dl className="grid gap-5 sm:grid-cols-3">
            <Detail label="Terms">
              {formatTerms(
                broker.payment_terms_days,
                broker.quick_pay_fee_percent
              )}
            </Detail>
            <Detail label="Invoices">
              {broker.invoice_method === "portal" ? (
                <>
                  Their portal, manual upload
                  {broker.portal_url && (
                    <a
                      href={broker.portal_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate font-normal text-muted-foreground underline"
                    >
                      {broker.portal_url.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </>
              ) : broker.billing_emails.length ? (
                broker.billing_emails.join("\n")
              ) : (
                none
              )}
            </Detail>
            <Detail label="Factoring">
              {broker.factored ? (
                <>
                  {factoring ? `Through ${factoring.name}` : "Factored"}
                  <span
                    className={
                      broker.noa_on_file && factoring
                        ? "block font-normal text-muted-foreground"
                        : "block font-normal text-amber-700 dark:text-amber-300"
                    }
                  >
                    {!factoring ? (
                      <>
                        Factoring company not set up.{" "}
                        <Link href={factoringHref} className="underline">
                          Set it up
                        </Link>
                      </>
                    ) : broker.noa_on_file ? (
                      "NOA on file"
                    ) : (
                      "No NOA on file yet"
                    )}
                  </span>
                </>
              ) : (
                "Not factored"
              )}
            </Detail>
            <Detail label="Email domains">
              {broker.email_domains.length ? (
                broker.email_domains.join(", ")
              ) : (
                <span className="text-amber-700 dark:text-amber-300">
                  None yet. Rate cons can&apos;t be checked.
                </span>
              )}
            </Detail>
            <Detail label="Mailing address">{address || none}</Detail>
            {broker.notes && <Detail label="Notes">{broker.notes}</Detail>}
          </dl>
        </SettingsCard>

        <SettingsCard
          title="FMCSA"
          description={
            fmcsa
              ? `Last checked ${checkedFormat.format(new Date(fmcsa.checked_at))}. Checked again when a new load comes in from this broker.`
              : broker.mc_number
                ? "Not checked yet."
                : "Add the MC number to check this broker with FMCSA."
          }
          footer={
            <SettingsCardFooter hint="Public data, shared by every OfficeTruck customer.">
              <RecheckButton
                organizationId={organization.id}
                brokerId={broker.id}
                disabled={!broker.mc_number}
              />
            </SettingsCardFooter>
          }
        >
          {fmcsa ? (
            <div className="flex flex-col gap-5">
              {flags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {flags.map((flag) => (
                    <FlagBadge key={flag.key} flag={flag} />
                  ))}
                </div>
              )}
              <dl className="grid gap-5 sm:grid-cols-3">
                <Detail label="Broker authority">
                  {fmcsa.broker_authority_active === null ? (
                    <span className="text-muted-foreground">Not reported</span>
                  ) : fmcsa.broker_authority_active ? (
                    "Active"
                  ) : (
                    <span className="text-destructive">Not active</span>
                  )}
                </Detail>
                <Detail label="Allowed to operate">
                  <YesNo value={fmcsa.allowed_to_operate} />
                </Detail>
                <Detail label="Broker bond on file">
                  <YesNo value={fmcsa.bond_on_file} />
                </Detail>
                <Detail label="Authority granted">
                  {fmcsa.authority_granted_on ? (
                    formatDate(fmcsa.authority_granted_on)
                  ) : (
                    <span className="text-muted-foreground">Not reported</span>
                  )}
                </Detail>
                <Detail label="Name on file">
                  {fmcsa.legal_name ?? none}
                  {fmcsa.dba_name && (
                    <span className="block font-normal text-muted-foreground">
                      DBA {fmcsa.dba_name}
                    </span>
                  )}
                </Detail>
                <Detail label="Phone on file">
                  {fmcsa.phone ? formatPhone(fmcsa.phone) : none}
                </Detail>
                <Detail label="Address on file" className="sm:col-span-3">
                  {fmcsaAddress || none}
                </Detail>
              </dl>
            </div>
          ) : (
            <SettingsEmptyState icon={Package} title="No FMCSA record">
              {broker.mc_number
                ? "Check this broker to see their authority, bond and any recent changes."
                : "Brokers are checked by MC number."}
            </SettingsEmptyState>
          )}
        </SettingsCard>

        <SettingsCard
          title="Payment history"
          description={`Expected: paid within ${broker.payment_terms_days === 0 ? "a few days of invoicing" : `${broker.payment_terms_days} days`}.`}
        >
          <SettingsEmptyState icon={Wallet} title="Comes with invoices">
            Average days to pay, open and overdue invoices, and the last payment
            will be worked out from your invoices once Invoices is built.
          </SettingsEmptyState>
        </SettingsCard>

        <ContactsCard
          organizationId={organization.id}
          brokerId={broker.id}
          contacts={contacts}
        />

        <SettingsCard
          title="Loads"
          contentClassName={loads.length ? "px-0 pb-0" : undefined}
          footer={
            loads.length > 0 && (
              <SettingsCardFooter
                hint={`${loads.length} ${loads.length === 1 ? "load" : "loads"} · ${formatRate(
                  loads
                    .filter((load) => load.status !== "cancelled")
                    .reduce((sum, load) => sum + Number(load.rate), 0)
                )} booked`}
              />
            )
          }
        >
          {loads.length === 0 ? (
            <SettingsEmptyState icon={Package} title="No loads yet">
              Loads show up here once this broker is picked on them.
            </SettingsEmptyState>
          ) : (
            <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Load</TableHead>
                  <TableHead className="hidden sm:table-cell">Pickup</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Rate con from
                  </TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loads.map((load) => (
                  <TableRow key={load.id}>
                    <TableCell className="max-w-64 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/org/${organization.slug}/loads/${load.id}`}
                          className="truncate font-medium hover:underline"
                        >
                          {load.reference}
                        </Link>
                        <LoadStatusBadge status={load.status} />
                      </div>
                      <div className="truncate text-sm text-muted-foreground">
                        {load.pickup_location} → {load.delivery_location}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {formatStopDate(load.pickup_start)}
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {load.rate_con_from ? (
                        <SenderWarning
                          check={checkSender(
                            load.rate_con_from,
                            broker.email_domains
                          )}
                          email={load.rate_con_from}
                          compact
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRate(load.rate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SettingsCard>

        <div className="mt-2">
          <BrokerForm
            organizationId={organization.id}
            base={base}
            broker={broker}
            factoring={factoring}
            factoringHref={factoringHref}
          />
        </div>
      </div>
    </div>
  )
}
