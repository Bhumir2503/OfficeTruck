import type { Metadata } from "next"
import { ArrowLeft, Ban, Package } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { FlagBadge } from "@/components/brokers/broker-badges"
import {
  ContactsCard,
  RecheckButton,
} from "@/components/brokers/broker-actions"
import { BrokerForm } from "@/components/brokers/broker-form"
import { BrokerPaymentHistory } from "@/components/brokers/broker-payment-history"
import { CustomerGlance } from "@/components/brokers/customer-glance"
import { CustomerNotes } from "@/components/brokers/customer-notes"
import { CustomerAutomationCard } from "@/components/brokers/customer-automation-card"
import { CustomerStatusMenu } from "@/components/brokers/customer-status-menu"
import {
  CUSTOMER_TAB_LABELS,
  customerTabHref,
  customerTabs,
  parseCustomerTab,
} from "@/components/brokers/customer-tabs"
import { SenderWarning } from "@/components/brokers/sender-warning"
import { LoadStatusBadge } from "@/components/loads/load-status-menu"
import {
  PageTabBar,
  PageTabPanel,
  PageTabsProvider,
} from "@/components/page-tabs"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import {
  FieldsCardSkeleton,
  StatsCardSkeleton,
  TableCardSkeleton,
  TabSkeleton,
} from "@/components/tab-skeletons"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { checkSender, fmcsaFlags, formatMc } from "@/lib/broker-format"
import {
  type BrokerLoad,
  type BrokerWithFmcsa,
  getBroker,
  getBrokerContacts,
  getBrokerLoads,
} from "@/lib/brokers"
import { formatDate } from "@/lib/driver-format"
import { getFactoringCompany } from "@/lib/factoring"
import { brokerPaymentStats, localToday } from "@/lib/invoice-format"
import { getBrokerInvoices } from "@/lib/invoices"
import { formatRate, formatStopDate } from "@/lib/load-format"
import { getOrganization } from "@/lib/organizations"
import { formatPhone } from "@/lib/phone"
import { createClient } from "@/lib/supabase/server"

async function brokerFor(
  params: PageProps<"/org/[slug]/customers/[id]">["params"]
) {
  const { slug, id } = await params
  const organization = await getOrganization(slug)
  const broker = organization ? await getBroker(organization.id, id) : null
  return { organization, broker }
}

export async function generateMetadata({
  params,
}: PageProps<"/org/[slug]/customers/[id]">): Promise<Metadata> {
  const { broker } = await brokerFor(params)
  return { title: broker ? broker.legal_name : "Customer not found" }
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

/** Their authority, bond and what FMCSA has on file, checked again on demand. */
function FmcsaCard({
  organizationId,
  broker,
}: {
  organizationId: string
  broker: BrokerWithFmcsa
}) {
  const fmcsa = broker.fmcsa
  const flags = fmcsaFlags(fmcsa)
  const none = <span className="text-muted-foreground">Not set</span>
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
            organizationId={organizationId}
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
  )
}

/** Every load booked with them, newest first, and who sent each rate con. */
function LoadsCard({
  loads,
  loadsBase,
  emailDomains,
}: {
  loads: BrokerLoad[]
  /** /org/<slug>/loads */
  loadsBase: string
  emailDomains: string[]
}) {
  return (
    <SettingsCard
      title="Loads"
      description="Every load booked with them, newest first."
      contentClassName={loads.length ? "px-0 pb-0" : undefined}
      footer={
        loads.length > 0 && (
          <SettingsCardFooter
            hint={(() => {
              const kept = loads.filter((load) => load.status !== "cancelled")
              const cancelled = loads.length - kept.length
              return `${loads.length} ${loads.length === 1 ? "load" : "loads"}${
                cancelled ? ` (${cancelled} cancelled)` : ""
              } · ${formatRate(
                kept.reduce((sum, load) => sum + Number(load.rate), 0)
              )} booked`
            })()}
          />
        )
      }
    >
      {loads.length === 0 ? (
        <SettingsEmptyState icon={Package} title="No loads yet">
          Loads show up here once this customer is picked on them.
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
                      href={`${loadsBase}/${load.id}`}
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
                      check={checkSender(load.rate_con_from, emailDomains)}
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
  )
}

export default async function BrokerPage({
  params,
  searchParams,
}: PageProps<"/org/[slug]/customers/[id]">) {
  const { slug, id } = await params
  const organization = await getOrganization(slug)
  if (!organization) {
    notFound()
  }
  // The customer and everything on their page at once: each is its own
  // round trip.
  const supabase = await createClient()
  const [broker, contacts, loads, factoring, invoices, { data: org }] =
    await Promise.all([
      getBroker(organization.id, id),
      getBrokerContacts(organization.id, id),
      getBrokerLoads(organization.id, id),
      getFactoringCompany(organization.id),
      getBrokerInvoices(organization.id, id),
      supabase
        .from("organizations")
        .select("broker_updates, auto_invoice")
        .eq("id", organization.id)
        .maybeSingle(),
    ])
  if (!broker) {
    notFound()
  }

  const base = `/org/${organization.slug}/customers`
  const customerHref = `${base}/${broker.id}`
  const factoringHref = `/org/${organization.slug}/settings/factoring`
  const tabs = customerTabs(broker.kind)
  const asked = parseCustomerTab((await searchParams).tab)
  const tab = tabs.includes(asked) ? asked : "overview"
  const today = localToday()
  const booked = loads.filter((load) => load.status !== "cancelled")

  const subtitle = [
    broker.kind === "shipper" ? "Direct shipper" : "Broker",
    broker.dba_name && `DBA ${broker.dba_name}`,
    formatMc(broker.mc_number),
    broker.dot_number && `USDOT ${broker.dot_number}`,
  ].filter(Boolean) as string[]

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
          All customers
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-tight break-words">
                {broker.legal_name}
              </h2>
              {broker.do_not_use ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                  <Ban className="size-3" aria-hidden />
                  Do not use
                </span>
              ) : (
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  Okay to book
                </span>
              )}
            </div>
            <p className="flex flex-wrap gap-x-1.5 text-sm text-muted-foreground">
              {subtitle.map((part, index) => (
                <span key={index}>
                  {index > 0 && <span aria-hidden>· </span>}
                  {part}
                </span>
              ))}
              {broker.phone && (
                <span>
                  <span aria-hidden>· </span>
                  <a href={`tel:${broker.phone}`} className="hover:underline">
                    {formatPhone(broker.phone)}
                  </a>
                </span>
              )}
            </p>
          </div>
          <CustomerStatusMenu
            organizationId={organization.id}
            broker={broker}
          />
        </div>
        {broker.do_not_use && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <Ban className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">Do not use.</span>{" "}
              {broker.do_not_use_reason ?? "No reason given."}
            </span>
          </div>
        )}
        <PageTabsProvider>
          <PageTabBar
            label="Customer sections"
            active={tab}
            tabs={tabs.map((t) => ({
              key: t,
              label:
                t === "loads" && loads.length
                  ? `${CUSTOMER_TAB_LABELS[t]} (${loads.length})`
                  : CUSTOMER_TAB_LABELS[t],
              href: customerTabHref(customerHref, t),
            }))}
          />
          <div className="grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1fr)_20rem] @6xl/main:grid-cols-[minmax(0,1fr)_24rem]">
            <PageTabPanel
              active={tab}
              className="flex min-w-0 flex-col gap-4"
              skeletons={CUSTOMER_TAB_SKELETONS}
            >
              {tab === "overview" && (
                <>
                  <BrokerForm
                    // Saved values that change elsewhere (another tab, a
                    // teammate) start the form over; the notes box doesn't.
                    key={JSON.stringify({
                      ...broker,
                      notes: null,
                      status_updates: null,
                      auto_invoice: null,
                      fmcsa: null,
                      updated_at: null,
                    })}
                    organizationId={organization.id}
                    base={base}
                    broker={broker}
                    factoring={factoring}
                    factoringHref={factoringHref}
                  />
                  <CustomerAutomationCard
                    organizationId={organization.id}
                    brokerId={broker.id}
                    field="auto_invoice"
                    title="Automatic invoicing"
                    description="Once a delivered load's rate con, BOL and POD are in, the invoice is made and the packet emailed. Unpaid invoices get reminders if that's on in Settings."
                    value={broker.auto_invoice}
                    companyDefault={org?.auto_invoice ?? false}
                    whenOn={
                      broker.factored ? (
                        "Packets go to your factoring company."
                      ) : broker.invoice_method === "portal" ? (
                        "They take invoices through a portal: you'll get a draft to upload."
                      ) : broker.billing_emails.length ? (
                        <>Goes to {broker.billing_emails.join(", ")}.</>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-300">
                          No billing email yet: invoices are left as drafts.
                        </span>
                      )
                    }
                    whenOff="You'll invoice their loads yourself."
                    settingsHref={`/org/${organization.slug}/settings`}
                  />
                  <CustomerAutomationCard
                    organizationId={organization.id}
                    brokerId={broker.id}
                    field="status_updates"
                    title="Status updates"
                    description="Emails when a driver arrives at or leaves a stop, and when the load is delivered: the time and where the driver was. Never the rate."
                    value={broker.status_updates}
                    companyDefault={org?.broker_updates ?? false}
                    whenOn={(() => {
                      const recipients = [
                        ...new Set(
                          contacts
                            .filter(
                              (contact) =>
                                contact.role === "dispatch" && contact.email
                            )
                            .map((contact) => contact.email!.toLowerCase())
                        ),
                      ]
                      return recipients.length ? (
                        <>Goes to {recipients.join(", ")}.</>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-300">
                          No dispatch contact with an email yet. Updates go to
                          whoever sent each rate con instead.
                        </span>
                      )
                    })()}
                    whenOff="They won't get automatic updates."
                    settingsHref={`/org/${organization.slug}/settings`}
                  />
                  <ContactsCard
                    organizationId={organization.id}
                    brokerId={broker.id}
                    contacts={contacts}
                  />
                </>
              )}
              {tab === "loads" && (
                <LoadsCard
                  loads={loads}
                  loadsBase={`/org/${organization.slug}/loads`}
                  emailDomains={broker.email_domains}
                />
              )}
              {tab === "payments" && (
                <BrokerPaymentHistory
                  invoices={invoices}
                  termsDays={broker.payment_terms_days}
                  today={today}
                  invoicesBase={`/org/${organization.slug}/invoices`}
                />
              )}
              {tab === "fmcsa" && (
                <FmcsaCard organizationId={organization.id} broker={broker} />
              )}
            </PageTabPanel>
            {/* Beside the cards, whether they're safe to book and the notes
              stay in view; on a phone they come first. */}
            <aside className="order-first flex flex-col gap-4 @4xl/main:sticky @4xl/main:top-6 @4xl/main:order-none @4xl/main:max-h-[calc(100svh-3rem)] @4xl/main:overflow-y-auto">
              <CustomerGlance
                kind={broker.kind}
                doNotUse={broker.do_not_use}
                flags={broker.kind === "broker" ? fmcsaFlags(broker.fmcsa) : []}
                checked={!!broker.fmcsa}
                termsDays={broker.payment_terms_days}
                quickPay={broker.quick_pay_fee_percent}
                stats={brokerPaymentStats(invoices, today)}
                loads={{
                  count: booked.length,
                  booked: booked.reduce(
                    (sum, load) => sum + Number(load.rate),
                    0
                  ),
                  cancelled: loads.length - booked.length,
                  // Newest first: the latest that has picked up, and the
                  // soonest still to come.
                  last:
                    booked.find(
                      (load) => load.pickup_start.slice(0, 10) <= today
                    )?.pickup_start ?? null,
                  next:
                    booked.findLast(
                      (load) => load.pickup_start.slice(0, 10) > today
                    )?.pickup_start ?? null,
                }}
              />
              <CustomerNotes
                organizationId={organization.id}
                brokerId={broker.id}
                notes={broker.notes}
                canManage
              />
            </aside>
          </div>
        </PageTabsProvider>
      </div>
    </div>
  )
}

/** Each tab's cards while it loads. */
const CUSTOMER_TAB_SKELETONS = {
  overview: (
    <TabSkeleton>
      <FieldsCardSkeleton title="Company" fields={6} />
      <FieldsCardSkeleton title="Mailing address" fields={4} />
      <FieldsCardSkeleton title="Billing" fields={4} />
      <FieldsCardSkeleton title="Factoring" fields={1} />
      <FieldsCardSkeleton title="Automatic invoicing" fields={1} />
      <FieldsCardSkeleton title="Status updates" fields={1} />
    </TabSkeleton>
  ),
  loads: (
    <TabSkeleton>
      <TableCardSkeleton title="Loads" rows={5} />
    </TabSkeleton>
  ),
  payments: (
    <TabSkeleton>
      <StatsCardSkeleton title="Payment history" />
    </TabSkeleton>
  ),
  fmcsa: (
    <TabSkeleton>
      <FieldsCardSkeleton title="FMCSA" fields={6} />
    </TabSkeleton>
  ),
}
