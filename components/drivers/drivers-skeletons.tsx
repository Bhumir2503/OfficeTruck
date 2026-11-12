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
 * Loading states for the Drivers pages. As in the loads skeletons, text that
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

const DRIVER_ROWS = [
  { name: "w-28", contact: "w-24", cdl: "w-24" },
  { name: "w-36", contact: "w-28", cdl: "w-20" },
  { name: "w-24", contact: "w-24", cdl: "w-28" },
  { name: "w-32", contact: "w-32", cdl: "w-24" },
]

export function DriversListSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div>
        <SettingsCard
          title="Drivers"
          description="Search by name, or filter by status."
          action={<Skeleton className="h-8 w-26 rounded-md" />}
          contentClassName="px-0 pb-0"
          footer={
            <SettingsCardFooter
              hint={<Skeleton className="h-4 w-16 bg-foreground/10" />}
            />
          }
        >
          <div className="flex flex-col gap-3 px-6 pb-4 sm:flex-row sm:items-center">
            <Skeleton className="h-9 w-full" />
            {/* Active, Inactive, All. */}
            <div className="flex shrink-0 gap-1">
              <Skeleton className="h-8 w-20 rounded-md" />
              <Skeleton className="h-8 w-22 rounded-md" />
              <Skeleton className="h-8 w-14 rounded-md" />
            </div>
          </div>
          <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead className="hidden lg:table-cell">CDL</TableHead>
                <TableHead className="hidden md:table-cell">Pay</TableHead>
                <TableHead className="hidden sm:table-cell">
                  Compliance
                </TableHead>
                <TableHead className="w-24">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DRIVER_ROWS.map((row, index) => (
                <TableRow key={index} className="hover:bg-transparent">
                  <TableCell className="py-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-8 shrink-0 rounded-full" />
                      <div>
                        <Line className={row.name} />
                        <Line className={cn("h-3.5", row.contact)} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Skeleton className={cn("h-4", row.cdl)} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Skeleton className="h-4 w-24" />
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

/** The driver form's cards. `editing` matches the detail page's version. */
function DriverFormSkeleton({ editing = false }: { editing?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <SettingsCard
        title={editing ? "Driver details" : "Driver"}
        description="Name and how to reach them."
        contentClassName="grid gap-5 sm:grid-cols-6"
      >
        <FieldSkeleton label="Full name" className="sm:col-span-6" />
        <FieldSkeleton label="Phone" className="sm:col-span-3" />
        <FieldSkeleton label="Email" className="sm:col-span-3" />
      </SettingsCard>
      <SettingsCard
        title="Compliance"
        description="You'll see a warning 60, 30 and 7 days before each one is due."
        contentClassName="grid gap-5 sm:grid-cols-6"
      >
        <FieldSkeleton label="CDL number" className="sm:col-span-4" />
        <FieldSkeleton label="Issuing state" className="sm:col-span-2" />
        <FieldSkeleton
          label="CDL expires"
          hint="The expiration date printed on the license."
          className="sm:col-span-3"
        />
        <FieldSkeleton
          label="Medical card expires"
          hint="From the DOT medical examiner's certificate."
          className="sm:col-span-3"
        />
        <FieldSkeleton
          label="Last annual review"
          hint="Review of the driving record. Due again a year later."
          className="sm:col-span-3"
        />
        <FieldSkeleton
          label="Last Clearinghouse query"
          hint="The yearly limited query. Due again a year later."
          className="sm:col-span-3"
        />
      </SettingsCard>
      {!editing && (
        <SettingsCard
          title="CDL and medical card"
          description="Optional. Photos or PDFs, kept private to your organization."
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <PhotoSkeleton label="CDL" />
            <PhotoSkeleton label="Medical card" />
          </div>
        </SettingsCard>
      )}
      <SettingsCard title="Pay" description="Used to work out profit per load.">
        <Field>
          <FieldLabel>Paid</FieldLabel>
          {/* Not set, Per mile, % of load, Flat per load. */}
          <div className="flex flex-wrap gap-1">
            <Skeleton className="h-8 w-18 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-22 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
        </Field>
      </SettingsCard>
      <SettingsCard
        title="Notes"
        footer={
          <SettingsCardFooter
            hint={
              editing
                ? "Changes are saved for everyone in your organization."
                : "New drivers start as active."
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

export function NewDriverSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-5xl">
        <DriverFormSkeleton />
      </div>
    </div>
  )
}

function DetailSkeleton({
  label,
  width,
  lines = 1,
}: {
  label: string
  width: string
  /** 2 for the yearly checks, which add a "Last done" line. */
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

/** A card-shaped photo slot with its label and buttons. */
function PhotoSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium">{label}</div>
      <Skeleton className="aspect-[1.586] w-full rounded-lg" />
      <Skeleton className="h-8 w-24 rounded-md" />
    </div>
  )
}

/**
 * Most people opening a driver can edit them, so this shows the edit form
 * below the summary; members see the summary on its own.
 */
export function DriverDetailSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        {/* The "All drivers" link: a small ghost button. */}
        <Skeleton className="h-8 w-28 rounded-md" />
        <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div className="space-y-1">
              <div className="flex h-6 items-center">
                <Skeleton className="h-4 w-36" />
              </div>
              <Line className="h-3.5 w-28" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="grid gap-5 px-6 pt-5 pb-6 sm:grid-cols-2">
            <DetailSkeleton label="CDL expires" width="w-24" />
            <DetailSkeleton label="Medical card expires" width="w-24" />
            <DetailSkeleton label="Annual review due" width="w-24" lines={2} />
            <DetailSkeleton
              label="Clearinghouse query due"
              width="w-24"
              lines={2}
            />
            <DetailSkeleton label="Pay" width="w-28" />
          </div>
          <div className="flex min-h-14 flex-col gap-3 border-t bg-muted/40 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-4 w-80 max-w-full bg-foreground/10" />
            <Skeleton className="h-8 w-32 rounded-md bg-foreground/10" />
          </div>
        </section>
        <SettingsCard
          title="CDL and medical card"
          description="Photos or PDFs, kept private to your organization."
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <PhotoSkeleton label="CDL" />
            <PhotoSkeleton label="Medical card" />
          </div>
        </SettingsCard>
        <SettingsCard
          title="Loads"
          description="Driver pay uses their current rate."
          contentClassName="space-y-3"
        >
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </SettingsCard>
        <div className="mt-2">
          <DriverFormSkeleton editing />
        </div>
      </div>
    </div>
  )
}
