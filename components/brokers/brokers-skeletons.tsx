import { cn } from "cn"

import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
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
 * Loading states for the Brokers pages. Text that doesn't depend on data is
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
        title="Brokers"
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
              <TableHead>Broker</TableHead>
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

/** The broker form's cards. `editing` matches the broker page's version. */
function BrokerFormSkeleton({ editing = false }: { editing?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
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
        title="Broker"
        description="As registered with FMCSA."
        contentClassName="grid gap-5 sm:grid-cols-6"
      >
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
      >
        <Field className="sm:col-span-6">
          <FieldLabel>How they take invoices</FieldLabel>
          <div className="flex flex-wrap gap-1">
            <Skeleton className="h-8 w-16 rounded-md" />
            <Skeleton className="h-8 w-48 rounded-md" />
          </div>
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
        description="If you factor this broker's loads, packets go to your factoring company instead."
      >
        <Skeleton className="h-4 w-56" />
      </SettingsCard>
      {!editing && (
        <SettingsCard
          title="Do not use"
          description="For a broker you're adding only to keep on record, e.g. one who never paid."
        >
          <Skeleton className="h-4 w-56" />
        </SettingsCard>
      )}
      <SettingsCard
        title="Notes"
        footer={
          <SettingsCardFooter
            hint={
              editing
                ? "Changes are saved for everyone in your organization."
                : "Brokers with an MC number are checked with FMCSA when saved."
            }
          >
            {!editing && (
              <Skeleton className="h-8 w-16 rounded-md bg-foreground/10" />
            )}
            <Skeleton className="h-8 w-28 rounded-md bg-foreground/10" />
          </SettingsCardFooter>
        }
      >
        <Skeleton className="h-16 w-full" />
      </SettingsCard>
    </div>
  )
}

export function NewBrokerSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-5xl">
        <BrokerFormSkeleton />
      </div>
    </div>
  )
}

function DetailSkeleton({
  label,
  width = "w-28",
}: {
  label: string
  width?: string
}) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1">
        <Line className={width} />
      </div>
    </div>
  )
}

export function BrokerDetailSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        {/* The "All brokers" link: a small ghost button. */}
        <Skeleton className="h-8 w-28 rounded-md" />
        <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="space-y-1 px-6 pt-5">
            <div className="flex h-6 items-center">
              <Skeleton className="h-4 w-56" />
            </div>
            <Line className="h-3.5 w-48" />
          </div>
          <div className="grid gap-5 px-6 pt-5 pb-6 sm:grid-cols-3">
            <DetailSkeleton label="Terms" width="w-20" />
            <DetailSkeleton label="Invoices" width="w-44" />
            <DetailSkeleton label="Factoring" width="w-24" />
            <DetailSkeleton label="Main phone" width="w-28" />
            <DetailSkeleton label="Email domains" width="w-24" />
            <DetailSkeleton label="Mailing address" width="w-40" />
          </div>
          <div className="flex min-h-14 flex-col gap-3 border-t bg-muted/40 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-4 w-72 max-w-full bg-foreground/10" />
            <Skeleton className="h-8 w-36 rounded-md bg-foreground/10" />
          </div>
        </section>
        <SettingsCard
          title="FMCSA"
          description={
            // The description is a <p>, so an inline placeholder.
            <span className="inline-block h-4 w-96 max-w-full animate-pulse rounded-md bg-muted align-middle" />
          }
          footer={
            <SettingsCardFooter hint="Public data, shared by every OfficeTruck customer.">
              <Skeleton className="h-8 w-28 rounded-md bg-foreground/10" />
            </SettingsCardFooter>
          }
        >
          <div className="grid gap-5 sm:grid-cols-3">
            <DetailSkeleton label="Broker authority" width="w-14" />
            <DetailSkeleton label="Allowed to operate" width="w-10" />
            <DetailSkeleton label="Broker bond on file" width="w-10" />
          </div>
        </SettingsCard>
        <SettingsCard
          title="Payment history"
          description={
            <span className="inline-block h-4 w-56 animate-pulse rounded-md bg-muted align-middle" />
          }
        >
          <Skeleton className="h-24 w-full" />
        </SettingsCard>
        <SettingsCard
          title="Contacts"
          description="Dispatch for loads, billing and accounting for payment."
        >
          <Skeleton className="h-24 w-full" />
        </SettingsCard>
        <div className="mt-2">
          <BrokerFormSkeleton editing />
        </div>
      </div>
    </div>
  )
}
