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
  { unit: "w-16", desc: "w-36", driver: "w-24" },
  { unit: "w-20", desc: "w-32", driver: "w-20" },
  { unit: "w-14", desc: "w-40", driver: "w-28" },
]

export function TrucksListSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <SettingsCard
        title="Trucks"
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
          {/* The status filter's dropdown. */}
          <Skeleton className="h-9 w-full shrink-0 rounded-md sm:w-44" />
        </div>
        <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Truck</TableHead>
              <TableHead className="hidden md:table-cell">Now</TableHead>
              <TableHead className="hidden lg:table-cell">
                Last delivery
              </TableHead>
              <TableHead className="hidden xl:table-cell">Driver</TableHead>
              <TableHead className="hidden sm:table-cell">Compliance</TableHead>
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
                <TableCell className="hidden md:table-cell">
                  <Line className="w-20" />
                  <Line className="h-3.5 w-32" />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <Line className="w-20" />
                  <Line className="h-3.5 w-28" />
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <Skeleton className={cn("h-4", row.driver)} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Skeleton className="h-6 w-36 rounded-full" />
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
        <FieldSkeleton label="Motive vehicle ID" className="sm:col-span-3" />
      </SettingsCard>
      {editing && (
        <>
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
              <SettingsCardFooter>
                <Skeleton className="h-8 w-28 rounded-md bg-foreground/10" />
              </SettingsCardFooter>
            }
          >
            <Skeleton className="h-16 w-full" />
          </SettingsCard>
        </>
      )}
    </div>
  )
}

export function NewTruckSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {/* The "All trucks" link: a small ghost button. */}
        <Skeleton className="h-8 w-26 rounded-md" />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <TruckFormSkeleton />
          </div>
          <aside className="flex flex-col gap-6 lg:col-start-2 lg:row-start-1">
            <section className="flex flex-col gap-4 rounded-xl border bg-card px-5 pt-4 pb-5 shadow-xs">
              <div>
                <h4 className="font-semibold">Fixed costs</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Spread over the truck&apos;s miles, empty miles included, for
                  cost per mile.
                </p>
              </div>
              <div className="grid gap-4">
                <FieldSkeleton label="Payment or lease" />
                <FieldSkeleton label="Insurance" />
                <FieldSkeleton
                  label="Other fixed costs"
                  hint="Permits, ELD fees, parking."
                />
              </div>
            </section>
            <section className="flex flex-col gap-3 rounded-xl border bg-card px-5 pt-4 pb-5 shadow-xs">
              <h4 className="font-semibold">Notes</h4>
              <Skeleton className="h-24 w-full" />
            </section>
            <section className="rounded-xl border bg-card px-5 pt-4 pb-5 shadow-xs">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                New truck
              </p>
              <h4 className="mt-1 text-xl font-semibold tracking-tight">
                Add a truck
              </h4>
              <p className="mt-2 text-sm text-muted-foreground">
                Fill in what you have. Only the unit number is needed to save,
                and anything else can be added from its page later. New trucks
                start as active.
              </p>
              <div className="mt-5 flex flex-col gap-2 border-t pt-5">
                <Skeleton className="h-10 w-full rounded-md bg-foreground/10" />
                <Skeleton className="mx-auto h-8 w-16 rounded-md" />
              </div>
            </section>
          </aside>
        </div>
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
  const panel = "rounded-xl border bg-card px-5 pt-4 pb-5 shadow-xs"
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {/* The "All trucks" link: a small ghost button. */}
        <Skeleton className="h-8 w-26 rounded-md" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex h-8 items-center gap-3">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Line className="w-72" />
          </div>
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-4">
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
            <TruckFormSkeleton editing />
          </div>
          <aside className="order-first flex flex-col gap-4 lg:order-none">
            <section className={panel}>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Compliance
              </p>
              <div className="mt-3 grid gap-4">
                <DetailSkeleton label="Annual inspection due" lines={2} />
                <DetailSkeleton label="Registration expires" />
                <DetailSkeleton label="Plate expires" />
                <DetailSkeleton label="2290 heavy vehicle tax" lines={2} />
              </div>
            </section>
            <section className={panel}>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Setup
              </p>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <DetailSkeleton label="ELD" width="w-28" />
                <DetailSkeleton label="Ownership" width="w-16" />
                <DetailSkeleton label="Default driver" width="w-28" />
                <DetailSkeleton label="Fixed costs" width="w-28" />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
