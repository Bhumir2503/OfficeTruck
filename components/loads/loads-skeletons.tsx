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
 * Loading states for the Loads pages. As in the settings skeletons, text that
 * doesn't depend on data is real and built from the same pieces as the pages,
 * so nothing shifts when the content arrives. Only values are placeholders.
 * Keep the page wrappers in step with the pages.
 */

/** A placeholder sized to the 20px line of text it stands in for. */
function Line({ className }: { className?: string }) {
  return (
    <div className="flex h-5 items-center">
      <Skeleton className={cn("h-4", className)} />
    </div>
  )
}

// All, Booked, In transit, Delivered, Invoiced, Cancelled.
const FILTER_WIDTHS = ["w-14", "w-20", "w-24", "w-24", "w-22", "w-24"]

const LOAD_ROWS = [
  { ref: "w-20", broker: "w-16", from: "w-36", to: "w-28" },
  { ref: "w-24", broker: "w-24", from: "w-28", to: "w-32" },
  { ref: "w-16", broker: "w-20", from: "w-32", to: "w-24" },
  { ref: "w-20", broker: "w-28", from: "w-24", to: "w-36" },
]

export function LoadsListSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div>
        <SettingsCard
          title="All loads"
          description="Search by load number or broker, or filter by status."
          action={<Skeleton className="h-8 w-26 rounded-md" />}
          contentClassName="px-0 pb-0"
          footer={
            <SettingsCardFooter
              hint={<Skeleton className="h-4 w-16 bg-foreground/10" />}
            />
          }
        >
          <div className="flex flex-col gap-3 px-6 pb-4">
            <Skeleton className="h-9 w-full" />
            <div className="flex flex-wrap gap-1">
              {FILTER_WIDTHS.map((width, index) => (
                <Skeleton key={index} className={cn("h-8 rounded-md", width)} />
              ))}
            </div>
          </div>
          <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Load</TableHead>
                <TableHead className="hidden md:table-cell">Route</TableHead>
                <TableHead className="hidden sm:table-cell">Pickup</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="w-32">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {LOAD_ROWS.map((row, index) => (
                <TableRow key={index} className="hover:bg-transparent">
                  <TableCell className="py-3">
                    <Line className={row.ref} />
                    <Line className={cn("h-3.5", row.broker)} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-1.5">
                      <Skeleton className={cn("h-4", row.from)} />
                      <Skeleton className={cn("h-4", row.to)} />
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Skeleton className="h-4 w-12" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="ml-auto h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SettingsCard>
      </div>
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

/** A date button and a time input, side by side. */
function DateTimeSkeleton({ label, hint }: { label: string; hint: string }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-32 shrink-0" />
      </div>
      <FieldDescription>{hint}</FieldDescription>
    </Field>
  )
}

function StopSkeleton({ title }: { title: string }) {
  return (
    <SettingsCard title={title}>
      <div className="grid gap-5 sm:grid-cols-2">
        <FieldSkeleton label="Location" className="sm:col-span-2" />
        <DateTimeSkeleton label="From" hint="Local time at the stop." />
        <DateTimeSkeleton
          label="To (optional)"
          hint="Leave the date blank for a set appointment."
        />
      </div>
    </SettingsCard>
  )
}

export function NewLoadSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <SettingsCard
          title="Load"
          description="From the rate confirmation."
          contentClassName="grid gap-5 sm:grid-cols-6"
        >
          <FieldSkeleton label="Load number" className="sm:col-span-2" />
          <FieldSkeleton label="Broker" className="sm:col-span-2" />
          <FieldSkeleton label="Rate (USD)" className="sm:col-span-2" />
        </SettingsCard>
        <StopSkeleton title="Pickup" />
        <StopSkeleton title="Delivery" />
        <SettingsCard
          title="Assignment"
          description="Optional. You can fill these in later."
          contentClassName="grid gap-5 sm:grid-cols-3"
          footer={
            <SettingsCardFooter hint="New loads start as booked.">
              <Skeleton className="h-8 w-16 rounded-md bg-foreground/10" />
              <Skeleton className="h-8 w-24 rounded-md bg-foreground/10" />
            </SettingsCardFooter>
          }
        >
          <FieldSkeleton label="Driver" />
          <FieldSkeleton label="Truck" />
          <FieldSkeleton label="Miles" hint="Used for per-mile pay." />
          <FieldSkeleton
            label="Notes"
            className="sm:col-span-3"
            inputClassName="h-20"
          />
        </SettingsCard>
      </div>
    </div>
  )
}

function DetailSkeleton({
  label,
  className,
  lines = ["w-24"],
}: {
  label: string
  className?: string
  lines?: string[]
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div>
        {lines.map((width, index) => (
          <Line key={index} className={width} />
        ))}
      </div>
    </div>
  )
}

export function LoadDetailSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {/* The "All loads" link: a small ghost button. */}
        <Skeleton className="h-8 w-24 rounded-md" />
        <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div className="space-y-1">
              <div className="flex h-6 items-center">
                <Skeleton className="h-4 w-32" />
              </div>
              <Line className="h-3.5 w-20" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="grid gap-5 px-6 pt-5 pb-6 sm:grid-cols-2">
            <DetailSkeleton label="Pickup" lines={["w-48", "w-56"]} />
            <DetailSkeleton label="Delivery" lines={["w-36", "w-56"]} />
          </div>
        </section>
        <SettingsCard title="Details">
          <div className="grid gap-5 sm:grid-cols-3">
            <DetailSkeleton label="Rate" lines={["w-20"]} />
            <DetailSkeleton label="Rate per mile" lines={["w-24"]} />
            <DetailSkeleton label="Truck" lines={["w-16"]} />
            <DetailSkeleton
              label="Notes"
              className="sm:col-span-3"
              lines={["w-64"]}
            />
          </div>
        </SettingsCard>
        <SettingsCard
          title="Driver and miles"
          description={
            // The description is a <p>, so an inline placeholder.
            <span className="inline-block h-4 w-48 animate-pulse rounded-md bg-muted align-middle" />
          }
          contentClassName="grid gap-5 sm:grid-cols-2"
          footer={
            <SettingsCardFooter
              hint={<Skeleton className="h-4 w-56 bg-foreground/10" />}
            >
              <Skeleton className="h-8 w-16 rounded-md bg-foreground/10" />
            </SettingsCardFooter>
          }
        >
          <FieldSkeleton label="Driver" />
          <FieldSkeleton label="Miles" hint="Used for per-mile pay." />
        </SettingsCard>
      </div>
    </div>
  )
}
