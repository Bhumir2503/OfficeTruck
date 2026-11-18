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
        description={
          editing
            ? "Name, how to reach them, and when they started."
            : "Name, how to reach them, when they started, and how they're paid."
        }
        contentClassName="grid gap-5 sm:grid-cols-6"
      >
        <FieldSkeleton label="Full name" className="sm:col-span-6" />
        <FieldSkeleton label="Sign-in number" className="sm:col-span-3" />
        <FieldSkeleton label="Email" className="sm:col-span-3" />
        <FieldSkeleton label="Start date" className="sm:col-span-3" />
        {!editing && (
          <Field className="sm:col-span-3">
            <FieldLabel>Paid</FieldLabel>
            <Skeleton className="h-9 w-full rounded-md" />
          </Field>
        )}
      </SettingsCard>
      <SettingsCard
        title="CDL"
        description="The license as printed. You'll see a warning 60, 30 and 7 days before it expires."
        contentClassName="grid gap-5 sm:grid-cols-6"
      >
        <FieldSkeleton label="CDL number" className="sm:col-span-4" />
        <FieldSkeleton label="Issuing state" className="sm:col-span-2" />
        <Field className="sm:col-span-6">
          <FieldLabel>Class</FieldLabel>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        </Field>
        <Field className="sm:col-span-6">
          <FieldLabel>Endorsements</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-28 rounded-md" />
            ))}
          </div>
        </Field>
        <FieldSkeleton
          label="Restrictions"
          hint="The letters printed on the license, if any."
          className="sm:col-span-3"
        />
        <FieldSkeleton
          label="CDL expires"
          hint="The expiration date printed on the license."
          className="sm:col-span-3"
        />
        <FieldSkeleton
          label="Other states, past 3 years"
          hint="Every other state that licensed them in the past 3 years. A hiring driving record is needed from each."
          className="sm:col-span-6"
        />
      </SettingsCard>
      <SettingsCard
        title="Annual checks"
        description="Each is due again a year after the last one. You'll see a warning 60, 30 and 7 days before."
        contentClassName="grid gap-5 sm:grid-cols-6"
      >
        <FieldSkeleton
          label="Last annual review"
          hint="When you last reviewed their driving record (MVR)."
          className="sm:col-span-3"
        />
        <FieldSkeleton
          label="Last Clearinghouse query"
          hint="When you last ran their limited query."
          className="sm:col-span-3"
        />
      </SettingsCard>
      {!editing && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <SettingsCardFooter hint="New drivers start as active.">
            <Skeleton className="h-8 w-16 rounded-md bg-foreground/10" />
            <Skeleton className="h-8 w-28 rounded-md bg-foreground/10" />
          </SettingsCardFooter>
        </div>
      )}
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

/**
 * Most people opening a driver can edit them, so this shows the edit form
 * below the summary; members see the summary on its own.
 */
export function DriverDetailSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {/* The "All drivers" link: a small ghost button. */}
        <Skeleton className="h-8 w-28 rounded-md" />
        <div className="flex flex-col gap-1">
          <div className="flex h-8 items-center gap-3">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>
          <Line className="w-64" />
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          {/* Same order as the page: details and the CDL first. */}
          <div className="flex min-w-0 flex-col gap-4">
            <DriverFormSkeleton editing />
            <SettingsCard
              title="Documents"
              description="CDL, medical card, driving record and other papers. Photos or PDFs, kept private to your organization."
            >
              <Skeleton className="h-10 w-full" />
              <Skeleton className="mt-2 h-10 w-full" />
            </SettingsCard>
          </div>
          <aside className="order-first flex flex-col gap-4 lg:order-none">
            <section className="overflow-hidden rounded-xl border bg-card px-5 pt-4 pb-5 shadow-xs">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Next action
              </p>
              <Skeleton className="mt-2 h-5 w-40" />
              <Line className="mt-2 w-full" />
              <Skeleton className="mt-4 h-10 w-full rounded-md" />
            </section>
            <section className="overflow-hidden rounded-xl border bg-card px-5 pt-4 pb-5 shadow-xs">
              <h4 className="font-semibold">Pay</h4>
              <p className="mt-3 text-sm font-medium">Paid</p>
              <Skeleton className="mt-2 h-9 w-full rounded-md" />
            </section>
            <section className="overflow-hidden rounded-xl border bg-card px-5 pt-4 pb-5 shadow-xs">
              <h4 className="font-semibold">Notes</h4>
              <Skeleton className="mt-3 h-24 w-full" />
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
