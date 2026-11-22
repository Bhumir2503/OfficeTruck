import { cn } from "cn"

import { AddRecordPanelSkeleton } from "@/components/add-record-panel"
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
              <TableHead className="hidden lg:table-cell">Odometer</TableHead>
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
                <TableCell className="hidden lg:table-cell">
                  <Line className="w-20" />
                  <Line className="h-3.5 w-20" />
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

/** A card's footer with its Save button, as on the truck page. */
function SaveFooter() {
  return (
    <SettingsCardFooter>
      <Skeleton className="h-8 w-20 rounded-md" />
    </SettingsCardFooter>
  )
}

function CostsCardSkeleton({ editing = false }: { editing?: boolean }) {
  return (
    <SettingsCard
      title="Fixed costs"
      contentClassName="grid gap-5 sm:grid-cols-6"
      footer={editing ? <SaveFooter /> : undefined}
    >
      <FieldSkeleton label="Payment or lease" className="sm:col-span-2" />
      <FieldSkeleton label="Insurance" className="sm:col-span-2" />
      <FieldSkeleton label="Other fixed costs" className="sm:col-span-2" />
    </SettingsCard>
  )
}

/** The truck form's cards. `editing` matches the truck page's version. */
function TruckFormSkeleton({ editing = false }: { editing?: boolean }) {
  // On the truck page each card saves on its own, from a footer.
  const footer = editing ? <SaveFooter /> : undefined
  return (
    <div className="flex flex-col gap-6">
      <SettingsCard
        title={editing ? "Truck details" : "Truck"}
        footer={footer}
        contentClassName="grid gap-5 sm:grid-cols-6"
      >
        <FieldSkeleton label="Unit number" className="sm:col-span-2" />
        <FieldSkeleton label="VIN" className="sm:col-span-4" />
        <FieldSkeleton label="Year" className="sm:col-span-2" />
        <FieldSkeleton label="Make" className="sm:col-span-2" />
        <FieldSkeleton label="Model" className="sm:col-span-2" />
        <FieldSkeleton label="Registered weight" className="sm:col-span-3" />
        <FieldSkeleton label="Axles" className="sm:col-span-3" />
      </SettingsCard>
      <SettingsCard
        title="Plate and compliance"
        footer={footer}
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
        footer={footer}
        contentClassName="grid gap-5 sm:grid-cols-6"
      >
        <FieldSkeleton label="Ownership" className="sm:col-span-3" />
        <FieldSkeleton label="Default driver" className="sm:col-span-3" />
        <FieldSkeleton label="Home base" className="sm:col-span-6" />
      </SettingsCard>
      <SettingsCard
        title="Maintenance schedule"
        footer={footer}
        contentClassName="grid gap-5 sm:grid-cols-6"
      >
        <FieldSkeleton label="Odometer" className="sm:col-span-3" />
        <FieldSkeleton label="Read on" className="sm:col-span-3" />
        <FieldSkeleton label="Service every" className="sm:col-span-3" />
        <FieldSkeleton
          label="Or every"
          hint="Whichever comes first, counted from the last preventive service logged."
          className="sm:col-span-3"
        />
      </SettingsCard>
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
          <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
            <TruckFormSkeleton />
            <CostsCardSkeleton />
            <SettingsCard title="Notes">
              <Skeleton className="h-16 w-full" />
            </SettingsCard>
          </div>
          <aside className="lg:col-start-2 lg:row-start-1">
            <AddRecordPanelSkeleton
              eyebrow="New truck"
              placeholderTitle="Add a truck"
              hint="Only the unit number is needed to save. Anything else can be added from its page later."
              sections={[
                { label: "Truck" },
                { label: "Plate and compliance" },
                { label: "Ownership and driver" },
                { label: "Maintenance schedule" },
                { label: "Fixed costs" },
                { label: "Notes", optional: true },
              ]}
            />
          </aside>
        </div>
      </div>
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
            <TruckFormSkeleton editing />
            <CostsCardSkeleton editing />
            <SettingsCard
              title="Maintenance"
              description={
                // The description is a <p>, so an inline placeholder.
                <span className="inline-block h-4 w-56 animate-pulse rounded-md bg-muted align-middle" />
              }
              action={<Skeleton className="h-8 w-36 rounded-md" />}
            >
              {/* As tall as the card's empty state. */}
              <Skeleton className="h-46.5 w-full" />
            </SettingsCard>
            <SettingsCard
              title="Documents"
              description="Kept private to your organization."
              action={<Skeleton className="h-8 w-32 rounded-md" />}
            >
              <Skeleton className="h-46.5 w-full" />
            </SettingsCard>
          </div>
          <aside className="order-first flex flex-col gap-4 lg:order-none">
            <section className={panel}>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Next action
              </p>
              <div className="mt-2 flex h-7 items-center">
                <Skeleton className="h-5 w-48" />
              </div>
              <Line className="mt-1 w-56" />
              <Skeleton className="mt-4 h-10 w-full rounded-md" />
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
