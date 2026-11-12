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
 * Loading states for the Trucks pages. As in the drivers skeletons, text
 * that doesn't depend on data is real and built from the same pieces as the
 * pages, so nothing shifts when the content arrives. Only values are
 * placeholders. Keep the page wrappers in step with the pages.
 */

/** A placeholder sized to the 20px line of text it stands in for. */
function Line({ className }: { className?: string }) {
  return (
    <div className="flex h-5 items-center">
      <Skeleton className={cn("h-4", className)} />
    </div>
  )
}

const TRUCK_ROWS = [
  { unit: "w-16", desc: "w-36", plate: "w-20", driver: "w-24" },
  { unit: "w-20", desc: "w-32", plate: "w-24", driver: "w-20" },
  { unit: "w-14", desc: "w-40", plate: "w-16", driver: "w-28" },
]

export function TrucksListSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <SettingsCard
        title="Trucks"
        description="Search by unit number, VIN or plate, or filter by status."
        action={<Skeleton className="h-8 w-24 rounded-md" />}
        contentClassName="px-0 pb-0"
        footer={
          <SettingsCardFooter
            hint={<Skeleton className="h-4 w-16 bg-foreground/10" />}
          />
        }
      >
        <div className="flex flex-col gap-3 px-6 pb-4 sm:flex-row sm:items-center">
          <Skeleton className="h-9 w-full" />
          {/* Active, Out of service, Inactive, All. */}
          <div className="flex shrink-0 gap-1">
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-30 rounded-md" />
            <Skeleton className="h-8 w-22 rounded-md" />
            <Skeleton className="h-8 w-14 rounded-md" />
          </div>
        </div>
        <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Truck</TableHead>
              <TableHead className="hidden lg:table-cell">Plate</TableHead>
              <TableHead className="hidden md:table-cell">Driver</TableHead>
              <TableHead className="hidden md:table-cell">ELD</TableHead>
              <TableHead className="hidden sm:table-cell">Compliance</TableHead>
              <TableHead className="w-32">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {TRUCK_ROWS.map((row, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                <TableCell className="py-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-8 shrink-0 rounded-full" />
                    <div>
                      <Line className={row.unit} />
                      <Line className={cn("h-3.5", row.desc)} />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <Skeleton className={cn("h-4", row.plate)} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Skeleton className={cn("h-4", row.driver)} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Skeleton className="h-6 w-24 rounded-full" />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Skeleton className="h-6 w-36 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-6 w-16 rounded-full" />
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

/** The truck form's cards. `editing` matches the truck page's version. */
function TruckFormSkeleton({ editing = false }: { editing?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <SettingsCard
        title={editing ? "Truck details" : "Truck"}
        description="The unit number is what your team calls it."
        contentClassName="grid gap-5 sm:grid-cols-6"
      >
        <FieldSkeleton label="Unit number" className="sm:col-span-2" />
        <FieldSkeleton
          label="VIN"
          hint="Matches IFTA rows when there's no ELD link."
          className="sm:col-span-4"
        />
        <FieldSkeleton label="Year" className="sm:col-span-2" />
        <FieldSkeleton label="Make" className="sm:col-span-2" />
        <FieldSkeleton label="Model" className="sm:col-span-2" />
      </SettingsCard>
      <SettingsCard
        title="Plate and compliance"
        description="You'll see a warning 60, 30 and 7 days before each one is due."
        contentClassName="grid gap-5 sm:grid-cols-6"
      >
        <FieldSkeleton label="Plate number" className="sm:col-span-4" />
        <FieldSkeleton label="Plate state" className="sm:col-span-2" />
        <FieldSkeleton label="Plate expires" className="sm:col-span-2" />
        <FieldSkeleton
          label="Registration or IRP expires"
          className="sm:col-span-2"
        />
        <FieldSkeleton
          label="Last annual inspection"
          hint="Due again a year later."
          className="sm:col-span-2"
        />
      </SettingsCard>
      <SettingsCard
        title="Ownership and driver"
        contentClassName="grid gap-5 sm:grid-cols-6"
      >
        <Field className="sm:col-span-6">
          <FieldLabel>Ownership</FieldLabel>
          {/* Not set, Owned, Leased, Owner-operator. */}
          <div className="flex flex-wrap gap-1">
            <Skeleton className="h-8 w-18 rounded-md" />
            <Skeleton className="h-8 w-18 rounded-md" />
            <Skeleton className="h-8 w-18 rounded-md" />
            <Skeleton className="h-8 w-30 rounded-md" />
          </div>
          <FieldDescription>
            Owner-operator means a driver&apos;s own truck, leased on to you.
          </FieldDescription>
        </Field>
        <FieldSkeleton
          label="Default driver"
          hint="Filled in on new loads with this truck."
          className="sm:col-span-3"
        />
      </SettingsCard>
      <SettingsCard
        title="ELD"
        description="Links this truck to Motive, so its miles by state land here for IFTA."
        action={<Skeleton className="h-6 w-28 rounded-full" />}
        contentClassName="grid gap-5 sm:grid-cols-6"
      >
        <FieldSkeleton
          label="Motive vehicle ID"
          hint="The vehicle's ID in Motive. Leave blank if it isn't on Motive."
          className="sm:col-span-3"
        />
      </SettingsCard>
      <SettingsCard
        title="Fixed costs"
        description="Spread over the truck's miles, empty miles included, for cost per mile."
        contentClassName="grid gap-5 sm:grid-cols-6"
      >
        <FieldSkeleton label="Payment or lease" className="sm:col-span-2" />
        <FieldSkeleton label="Insurance" className="sm:col-span-2" />
        <FieldSkeleton
          label="Other fixed costs"
          hint="Permits, ELD fees, parking."
          className="sm:col-span-2"
        />
      </SettingsCard>
      <SettingsCard
        title="Notes"
        footer={
          <SettingsCardFooter
            hint={
              editing
                ? "Changes are saved for everyone in your organization."
                : "New trucks start as active."
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

export function NewTruckSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-5xl">
        <TruckFormSkeleton />
      </div>
    </div>
  )
}

function DetailSkeleton({
  label,
  width = "w-24",
  lines = 1,
}: {
  label: string
  width?: string
  lines?: 1 | 2
}) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1">
        <Line className={width} />
        {lines === 2 && (
          <div className="mt-0.5">
            <Line className="w-32" />
          </div>
        )}
      </div>
    </div>
  )
}

function StatSkeleton({ label, hint }: { label: string; hint?: string }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 flex h-7 items-center">
        <Skeleton className="h-5 w-16" />
      </div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

export function TruckDetailSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        {/* The "All trucks" link: a small ghost button. */}
        <Skeleton className="h-8 w-26 rounded-md" />
        <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div className="space-y-1">
              <div className="flex h-6 items-center">
                <Skeleton className="h-4 w-24" />
              </div>
              <Line className="h-3.5 w-64" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="grid gap-5 px-6 pt-5 pb-6 sm:grid-cols-3">
            <DetailSkeleton label="Annual inspection due" lines={2} />
            <DetailSkeleton label="Registration expires" />
            <DetailSkeleton label="Plate expires" />
            <DetailSkeleton label="2290 heavy vehicle tax" lines={2} />
            <DetailSkeleton label="Plate" width="w-20" />
            <DetailSkeleton label="ELD" width="w-28" />
            <DetailSkeleton label="Ownership" width="w-16" />
            <DetailSkeleton label="Default driver" width="w-28" />
            <DetailSkeleton label="Fixed costs" width="w-28" />
          </div>
          <div className="flex min-h-14 flex-col gap-3 border-t bg-muted/40 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-4 w-80 max-w-full bg-foreground/10" />
            <Skeleton className="h-8 w-32 rounded-md bg-foreground/10" />
          </div>
        </section>
        <SettingsCard
          title="This week"
          description={
            // The description is a <p>, so an inline placeholder.
            <span className="inline-block h-4 w-40 animate-pulse rounded-md bg-muted align-middle" />
          }
          footer={
            <SettingsCardFooter
              hint={<Skeleton className="h-4 w-72 bg-foreground/10" />}
            />
          }
        >
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <StatSkeleton label="Loads" />
            <StatSkeleton label="Miles" hint="Loaded and empty" />
            <StatSkeleton label="Revenue" />
            <StatSkeleton
              label="Cost per mile"
              hint="Fixed costs and driver pay"
            />
          </div>
        </SettingsCard>
        <SettingsCard title="Loads" contentClassName="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </SettingsCard>
        <div className="mt-2">
          <TruckFormSkeleton editing />
        </div>
      </div>
    </div>
  )
}
