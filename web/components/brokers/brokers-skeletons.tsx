import { cn } from "cn"

import { AddRecordPanelSkeleton } from "@/components/add-record-panel"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { TabBarSkeleton } from "@/components/tab-skeletons"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/*
 * Loading states for the Customers pages. Text that doesn't depend on data is
 * real and built from the same pieces as the pages, so nothing shifts when
 * the content arrives. Keep the page wrappers in step with the pages.
 */

function Line({ className }: { className?: string }) {
  return (
    <div className="flex h-5 items-center">
      <Skeleton className={cn("h-4", className)} />
    </div>
  )
}

const BROKER_ROWS = [
  { name: "w-40", mc: "w-24", terms: "w-14", email: "w-40" },
  { name: "w-32", mc: "w-28", terms: "w-16", email: "w-32" },
  { name: "w-48", mc: "w-20", terms: "w-14", email: "w-36" },
]

export function BrokersListSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <SettingsCard
        title="Customers"
        description="Search by name or MC number."
        action={<Skeleton className="h-8 w-28 rounded-md" />}
        contentClassName="px-0 pb-0"
        footer={
          <SettingsCardFooter
            hint={<Skeleton className="h-4 w-16 bg-foreground/10" />}
          />
        }
      >
        <div className="flex flex-col gap-3 px-6 pb-4 sm:flex-row sm:items-center">
          <Skeleton className="h-9 w-full" />
          {/* All, Flagged, Do not use. */}
          <div className="flex shrink-0 gap-1">
            <Skeleton className="h-8 w-14 rounded-md" />
            <Skeleton className="h-8 w-22 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
        </div>
        <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden md:table-cell">Terms</TableHead>
              <TableHead className="hidden lg:table-cell">Invoices</TableHead>
              <TableHead className="text-right sm:text-left">FMCSA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {BROKER_ROWS.map((row, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                <TableCell className="py-3">
                  <Line className={row.name} />
                  <Line className={cn("h-3.5", row.mc)} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Skeleton className={cn("h-4", row.terms)} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <Skeleton className={cn("h-4", row.email)} />
                </TableCell>
                <TableCell>
                  <Skeleton className="ml-auto h-6 w-16 rounded-full sm:ml-0" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SettingsCard>
    </div>
  )
}

function FieldSkeleton({
  label,
  hint,
  className,
  inputClassName,
}: {
  label: string
  hint?: string
  className?: string
  inputClassName?: string
}) {
  return (
    <Field className={className}>
      <FieldLabel>{label}</FieldLabel>
      <Skeleton className={cn("h-9 w-full", inputClassName)} />
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )
}

/** A card's Save button, as on the customer page's cards. */
function SaveFooter() {
  return (
    <SettingsCardFooter>
      <Skeleton className="h-8 w-16 rounded-md bg-foreground/10" />
    </SettingsCardFooter>
  )
}

function ToggleSkeleton({ widths }: { widths: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {widths.map((width, index) => (
        <Skeleton key={index} className={cn("h-8 rounded-md", width)} />
      ))}
    </div>
  )
}

/**
 * The customer form's cards. `editing` is the customer page's Overview,
 * where each card saves on its own; otherwise Add customer's cards.
 */
function BrokerFormSkeleton({ editing = false }: { editing?: boolean }) {
  const footer = editing ? <SaveFooter /> : undefined
  return (
    <>
      {!editing && (
        <SettingsCard
          title="Customer type"
          description="A broker arranges the load for a fee. A direct shipper owns the freight and pays you themselves."
        >
          <ToggleSkeleton widths={["w-16", "w-28"]} />
        </SettingsCard>
      )}
      {!editing && (
        <SettingsCard
          title="Look up by MC number"
          description="Checks whether you already have this broker, and fills in what FMCSA has on file."
          footer={
            <SettingsCardFooter hint="Or skip this and fill in the form yourself.">
              <Skeleton className="h-8 w-24 rounded-md bg-foreground/10" />
            </SettingsCardFooter>
          }
        >
          <FieldSkeleton label="MC number" className="max-w-xs" />
        </SettingsCard>
      )}
      <SettingsCard
        title={editing ? "Company" : "Broker"}
        description="As registered with FMCSA."
        contentClassName="grid gap-5 sm:grid-cols-6"
        footer={footer}
      >
        {editing && (
          <Field className="sm:col-span-6">
            <FieldLabel>Type</FieldLabel>
            <ToggleSkeleton widths={["w-16", "w-28"]} />
          </Field>
        )}
        <FieldSkeleton label="Legal name" className="sm:col-span-3" />
        <FieldSkeleton label="DBA name" className="sm:col-span-3" />
        <FieldSkeleton
          label="MC number"
          hint="Used to check them with FMCSA."
          className="sm:col-span-3"
        />
        <FieldSkeleton label="USDOT number" className="sm:col-span-3" />
        <FieldSkeleton
          label="Main phone"
          hint="The number you'd call to check a rate con is real."
          className="sm:col-span-2"
        />
        <FieldSkeleton
          label="Email domains"
          hint="Domains their people email from, separated by commas. Rate cons from any other domain get a warning."
          className="sm:col-span-4"
        />
      </SettingsCard>
      {!editing && (
        <SettingsCard
          title="Contacts"
          description="Optional. Dispatch for loads, billing and accounting for payment. Saved with the broker."
          contentClassName="flex flex-col gap-5"
        >
          <div className="grid gap-3 sm:grid-cols-12">
            <FieldSkeleton label="Name" className="sm:col-span-3" />
            <FieldSkeleton label="Role" className="sm:col-span-2" />
            <FieldSkeleton label="Email" className="sm:col-span-4" />
            <FieldSkeleton label="Phone" className="sm:col-span-3" />
          </div>
          <Skeleton className="ml-auto h-8 w-28 rounded-md" />
        </SettingsCard>
      )}
      <SettingsCard
        title="Mailing address"
        description="Where paper invoices and checks go."
        contentClassName="grid gap-5 sm:grid-cols-6"
        footer={footer}
      >
        <FieldSkeleton label="Street address" className="sm:col-span-6" />
        <FieldSkeleton
          label="Suite, unit or PO box"
          className="sm:col-span-6"
        />
        <FieldSkeleton label="City" className="sm:col-span-3" />
        <FieldSkeleton label="State" className="sm:col-span-1" />
        <FieldSkeleton label="ZIP code" className="sm:col-span-2" />
      </SettingsCard>
      <SettingsCard
        title="Billing"
        description="Where invoice packets go, and how fast they pay."
        contentClassName="grid gap-5 sm:grid-cols-6"
        footer={footer}
      >
        <Field className="sm:col-span-6">
          <FieldLabel>How they take invoices</FieldLabel>
          <ToggleSkeleton widths={["w-16", "w-48"]} />
          <FieldDescription>
            Packets are emailed to the billing addresses below.
          </FieldDescription>
        </Field>
        <FieldSkeleton
          label="Billing emails"
          hint="One per line, or separated by commas."
          className="sm:col-span-6"
          inputClassName="h-16"
        />
        <FieldSkeleton
          label="Payment terms"
          hint="Net 30 unless they say otherwise. 0 means due on receipt."
          className="sm:col-span-3"
        />
        <FieldSkeleton
          label="Quick-pay fee"
          hint="Taken off the rate for paying early."
          className="sm:col-span-3"
        />
      </SettingsCard>
      <SettingsCard
        title="Factoring"
        description="If you factor this customer's loads, packets go to your factoring company instead."
        footer={footer}
      >
        <Skeleton className="h-4 w-56" />
      </SettingsCard>
      {!editing && (
        <SettingsCard
          title="Do not use"
          description="For a customer you're adding only to keep on record, e.g. one who never paid."
        >
          <Skeleton className="h-4 w-56" />
        </SettingsCard>
      )}
      {!editing && (
        <SettingsCard title="Notes">
          <Skeleton className="h-16 w-full" />
        </SettingsCard>
      )}
    </>
  )
}

/** The "All customers" link: a small ghost button. */
function BackLinkSkeleton() {
  return <Skeleton className="h-8 w-32 rounded-md" />
}

export function NewBrokerSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <BackLinkSkeleton />
        <div className="grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1fr)_20rem] @6xl/main:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <BrokerFormSkeleton />
          </div>
          <aside>
            <AddRecordPanelSkeleton
              eyebrow="New customer"
              placeholderTitle="Add a customer"
              hint="Saving needs the legal name, and a billing email unless they take invoices through a portal. Brokers with an MC number are checked with FMCSA when saved."
              sections={[
                { label: "Customer type" },
                { label: "Broker" },
                { label: "Contacts", optional: true },
                { label: "Mailing address" },
                { label: "Billing" },
                { label: "Do not use", optional: true },
                { label: "Notes", optional: true },
              ]}
            />
          </aside>
        </div>
      </div>
    </div>
  )
}

export function BrokerDetailSkeleton() {
  const panel = "rounded-xl border bg-card px-5 pt-4 pb-5 shadow-xs"
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <BackLinkSkeleton />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex h-8 items-center gap-3">
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Line className="w-72" />
          </div>
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
        {/* Overview, Loads, Payments, FMCSA. */}
        <TabBarSkeleton widths={["w-20", "w-16", "w-20", "w-16"]} />
        <div className="grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1fr)_20rem] @6xl/main:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <BrokerFormSkeleton editing />
            <SettingsCard
              title="Status updates"
              description="Emails when a driver arrives at or leaves a stop, and when the load is delivered: the time and where the driver was. Never the rate."
            >
              <ToggleSkeleton widths={["w-44", "w-12", "w-12"]} />
            </SettingsCard>
            <SettingsCard
              title="Contacts"
              description="Dispatch for loads, billing and accounting for payment."
            >
              <Skeleton className="h-24 w-full" />
            </SettingsCard>
          </div>
          <aside className="order-first flex flex-col gap-4 @4xl/main:order-none">
            <section className={panel}>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                At a glance
              </p>
              <div className="mt-2 flex h-7 items-center">
                <Skeleton className="h-5 w-40" />
              </div>
              <Line className="mt-1 w-56" />
              <div className="mt-3 flex flex-col divide-y border-t">
                {["Terms", "Pays in", "Open", "Loads", "Last load"].map(
                  (label) => (
                    <div
                      key={label}
                      className="flex items-center justify-between py-1.5 text-sm"
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <Skeleton className="h-4 w-20" />
                    </div>
                  )
                )}
              </div>
            </section>
            <section className={cn(panel, "flex flex-col gap-3")}>
              <h4 className="font-semibold">Notes</h4>
              <Skeleton className="h-16 w-full" />
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
